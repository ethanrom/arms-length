import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "./types";
import { LlmError } from "./types";

// The SDK is replaced by a recorder: no network, no credentials.
const sent: { input: Record<string, unknown>; options: unknown }[] = [];
let failures: (Error & { $metadata?: { httpStatusCode: number } })[] = [];

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  ConverseCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  BedrockRuntimeClient: class {
    async send(command: { input: Record<string, unknown> }, options: unknown) {
      sent.push({ input: command.input, options });
      const failure = failures.shift();
      if (failure) throw failure;
      return {
        output: { message: { role: "assistant", content: [{ reasoningContent: { reasoningText: { text: "hm", signature: "s" } } }, { toolUse: { toolUseId: "t1", name: "observe_scene", input: {} } }] } },
        stopReason: "tool_use",
        usage: { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 900, cacheWriteInputTokens: 50 },
      };
    }
  },
}));

const { createBedrockClient, bedrockConfigured } = await import("./llm");

const env = { CLAUDE_AWS_REGION: "us-east-1", CLAUDE_AWS_ACCESS_KEY: "AKIA-TEST", CLAUDE_AWS_SECRET_KEY: "shh-secret", CLAUDE_AWS_MODEL: "model-id" };
const request = (): LlmRequest => ({
  system: "You plan.",
  tools: [{ name: "observe_scene", description: "d", inputSchema: { type: "object", properties: {}, additionalProperties: false } }],
  messages: [
    { role: "user", content: [{ text: "My day" }] },
    { role: "assistant", content: [{ reasoningContent: { reasoningText: { text: "think", signature: "sig" } } }, { toolUse: { toolUseId: "t0", name: "observe_scene", input: {} } }] },
    { role: "user", content: [{ toolResult: { toolUseId: "t0", content: [{ text: "{}" }], status: "success" } }] },
  ],
});

beforeEach(() => {
  sent.length = 0;
  failures = [];
});

describe("createBedrockClient", () => {
  it("knows whether it is configured", () => {
    expect(bedrockConfigured(env)).toBe(true);
    expect(bedrockConfigured({ ...env, CLAUDE_AWS_MODEL: "" })).toBe(false);
  });

  it("refuses to call without configuration, without naming any value", async () => {
    await expect(createBedrockClient({}).converse(request())).rejects.toMatchObject({ kind: "upstream" });
  });

  it("sends auto tool choice, low effort, and cache points on tools, system and the last message only", async () => {
    const req = request();
    const res = await createBedrockClient(env).converse(req);
    const input = sent[0].input as { modelId: string; system: unknown[]; messages: { content: unknown[] }[]; toolConfig: { tools: unknown[]; toolChoice: unknown }; additionalModelRequestFields: unknown };
    expect(input.modelId).toBe("model-id");
    expect(input.toolConfig.toolChoice).toEqual({ auto: {} });
    expect(input.toolConfig.tools).toHaveLength(2);
    expect(input.toolConfig.tools[1]).toEqual({ cachePoint: { type: "default" } });
    expect(input.system).toEqual([{ text: "You plan." }, { cachePoint: { type: "default" } }]);
    expect(input.additionalModelRequestFields).toEqual({ output_config: { effort: "low" } });
    expect(input.messages[2].content.at(-1)).toEqual({ cachePoint: { type: "default" } });
    expect(input.messages[0].content).toHaveLength(1);
    // The caller's history is untouched, assistant reasoning included.
    expect(req.messages[2].content).toHaveLength(1);
    expect(input.messages[1].content).toEqual(req.messages[1].content);
    expect(res).toEqual({
      content: [{ reasoningContent: { reasoningText: { text: "hm", signature: "s" } } }, { toolUse: { toolUseId: "t1", name: "observe_scene", input: {} } }],
      stopReason: "tool_use",
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 50 },
    });
  });

  it("takes the effort from CLAUDE_AWS_EFFORT, and ignores values it does not know", async () => {
    await createBedrockClient({ ...env, CLAUDE_AWS_EFFORT: "low" }).converse(request());
    await createBedrockClient({ ...env, CLAUDE_AWS_EFFORT: "extreme" }).converse(request());
    expect(sent.map((s) => (s.input.additionalModelRequestFields as { output_config: { effort: string } }).output_config.effort)).toEqual(["low", "low"]);
  });

  it("can switch the cache off", async () => {
    await createBedrockClient({ ...env, CLAUDE_AWS_CACHE: "0" }).converse(request());
    const input = sent[0].input as { system: unknown[]; messages: { content: unknown[] }[]; toolConfig: { tools: unknown[] } };
    expect(input.system).toHaveLength(1);
    expect(input.toolConfig.tools).toHaveLength(1);
    expect(input.messages[2].content).toHaveLength(1);
  });

  it("retries once without cache points when the model rejects them, and keeps them off", async () => {
    const rejection = Object.assign(new Error("cachePoint is not supported"), { name: "ValidationException" });
    failures = [rejection];
    const client = createBedrockClient(env);
    await client.converse(request());
    expect(sent).toHaveLength(2);
    expect((sent[1].input.system as unknown[]).length).toBe(1);
    await client.converse(request());
    expect(sent).toHaveLength(3);
    expect((sent[2].input.system as unknown[]).length).toBe(1);
  });

  it("reports failures by class and status only, never the provider's message", async () => {
    failures = [Object.assign(new Error("secret: AKIA-TEST rejected for model-id"), { name: "AccessDeniedException", $metadata: { httpStatusCode: 403 } })];
    const error = await createBedrockClient(env).converse(request()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).kind).toBe("upstream");
    expect((error as LlmError).message).toBe("The language model call failed (AccessDeniedException, HTTP 403).");
    expect(JSON.stringify(error)).not.toContain("AKIA");
  });

  it("maps an aborted call to a timeout or an abort", async () => {
    const controller = new AbortController();
    controller.abort(Object.assign(new Error("t"), { name: "TimeoutError" }));
    failures = [Object.assign(new Error("x"), { name: "AbortError" })];
    const timeout = await createBedrockClient(env).converse({ ...request(), signal: controller.signal }).catch((e: unknown) => e);
    expect((timeout as LlmError).kind).toBe("timeout");
    failures = [Object.assign(new Error("x"), { name: "AbortError" })];
    const gone = await createBedrockClient(env).converse({ ...request(), signal: AbortSignal.abort() }).catch((e: unknown) => e);
    expect((gone as LlmError).kind).toBe("aborted");
  });
});
