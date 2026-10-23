/**
 * Spike: one Sonnet 5.5 Converse call with a tool, to pin the agent's LLM adapter (the Mantle client 404s on this
 * account and region). Model id from CLAUDE_AWS_MODEL. Prints shapes and usage only, never credentials or env values.
 * Run: npm run spike -- scripts/spikes/rehearse-bedrock.ts
 */
import { BedrockRuntimeClient, ConverseCommand, type Tool } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.CLAUDE_AWS_REGION,
  credentials: { accessKeyId: process.env.CLAUDE_AWS_ACCESS_KEY ?? "", secretAccessKey: process.env.CLAUDE_AWS_SECRET_KEY ?? "" },
});

const tools: Tool[] = [
  {
    toolSpec: {
      name: "observe_scene",
      description: "Runs the vision model for one moment of the day. Call it once per moment.",
      inputSchema: {
        json: {
          type: "object",
          properties: { distanceM: { type: "number" }, label: { type: "string" } },
          required: ["distanceM", "label"],
          additionalProperties: false,
        },
      },
    },
  },
];

async function main(): Promise<void> {
  const started = Date.now();
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId: process.env.CLAUDE_AWS_MODEL,
        system: [{ text: "You plan a day as moments. Use the tools; never invent numbers." }],
        messages: [{ role: "user", content: [{ text: "My day: coffee with a friend at 9, dinner at 7. Call observe_scene for each moment." }] }],
        toolConfig: { tools, toolChoice: { auto: {} } },
        inferenceConfig: { maxTokens: 2000 },
        additionalModelRequestFields: { output_config: { effort: "medium" } },
      }),
    );
    const blocks = res.output?.message?.content ?? [];
    console.log(
      JSON.stringify(
        {
          ok: true,
          ms: Date.now() - started,
          stop: res.stopReason,
          blocks: blocks.map((b) => Object.keys(b)[0]),
          toolUses: blocks.filter((b) => b.toolUse).map((b) => ({ name: b.toolUse?.name, input: b.toolUse?.input })),
          usage: res.usage,
        },
        null,
        1,
      ),
    );
  } catch (e) {
    const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.log(JSON.stringify({ ok: false, ms: Date.now() - started, name: err.name, status: err.$metadata?.httpStatusCode, message: String(err.message).slice(0, 400) }, null, 1));
  }
}

void main();
