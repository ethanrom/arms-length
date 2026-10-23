/**
 * The model adapter: Claude Sonnet 5.5 through the Amazon Bedrock Converse API, behind the small LlmClient interface the
 * loop uses (so tests inject a scripted fake). Server-side only: it reads credentials from the environment and never
 * prints or returns them.
 *
 * Facts about this model that shape the loop (spike, scripts/spikes/rehearse-bedrock.ts):
 * - a forced tool choice (any/tool) is a 400, so the choice is auto and the loop checks that final_answer was called;
 * - assistant content blocks, reasoningContent included, must be passed back unchanged;
 * - parallel toolUse blocks come back in one message, and all their results go back in one user message.
 */
import { BedrockRuntimeClient, ConverseCommand, type Message, type Tool } from "@aws-sdk/client-bedrock-runtime";
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from "./types";

type Env = Record<string, string | undefined>;

/** Room for the reasoning blocks plus a plan of 8 moments. */
const MAX_OUTPUT_TOKENS = 8000;

export interface BedrockOptions {
  /** Per-call transport retries (throttling). The loop's own budget still applies. */
  maxAttempts?: number;
}

export function bedrockConfigured(env: Env): boolean {
  return !!(env.CLAUDE_AWS_REGION && env.CLAUDE_AWS_ACCESS_KEY && env.CLAUDE_AWS_SECRET_KEY && env.CLAUDE_AWS_MODEL);
}

export function createBedrockClient(env: Env = process.env, options: BedrockOptions = {}): LlmClient {
  let client: BedrockRuntimeClient | null = null;

  const connect = (): BedrockRuntimeClient => {
    if (!bedrockConfigured(env)) throw new LlmError("upstream", "The language model is not configured on this server.");
    client ??= new BedrockRuntimeClient({
      region: env.CLAUDE_AWS_REGION,
      credentials: { accessKeyId: env.CLAUDE_AWS_ACCESS_KEY ?? "", secretAccessKey: env.CLAUDE_AWS_SECRET_KEY ?? "" },
      maxAttempts: options.maxAttempts ?? 2,
    });
    return client;
  };

  return {
    async converse(request: LlmRequest): Promise<LlmResponse> {
      const bedrock = connect();
      const tools: Tool[] = request.tools.map((t) => ({
        toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema as never } },
      }));
      try {
        const res = await bedrock.send(
          new ConverseCommand({
            modelId: env.CLAUDE_AWS_MODEL,
            system: [{ text: request.system }],
            messages: request.messages as Message[],
            toolConfig: { tools, toolChoice: { auto: {} } },
            inferenceConfig: { maxTokens: MAX_OUTPUT_TOKENS },
            additionalModelRequestFields: { output_config: { effort: "medium" } },
          }),
          { abortSignal: request.signal },
        );
        return {
          content: res.output?.message?.content ?? [],
          stopReason: res.stopReason ?? "unknown",
          usage: { inputTokens: res.usage?.inputTokens ?? 0, outputTokens: res.usage?.outputTokens ?? 0 },
        };
      } catch (error) {
        throw toLlmError(error, request.signal);
      }
    },
  };
}

/** Only the error's class and HTTP status leave this function: provider messages can echo request details. */
function toLlmError(error: unknown, signal: AbortSignal | undefined): LlmError {
  if (error instanceof LlmError) return error;
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (signal?.aborted || e.name === "AbortError" || e.name === "TimeoutError") {
    const reason = signal?.reason as { name?: string } | undefined;
    return new LlmError(e.name === "TimeoutError" || reason?.name === "TimeoutError" ? "timeout" : "aborted", "The language model call was stopped.");
  }
  const status = e.$metadata?.httpStatusCode;
  return new LlmError("upstream", `The language model call failed (${e.name ?? "error"}${status ? `, HTTP ${status}` : ""}).`);
}
