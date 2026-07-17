import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-haiku-4-5";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — copy .env.example to .env and fill it in.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ChooseActionTool {
  name: "choose_action";
  description: string;
  input_schema: {
    type: "object";
    properties: {
      choiceIndex: { type: "integer"; enum: number[]; description: string };
      reasoning: { type: "string"; description: string };
    };
    required: ["choiceIndex"];
  };
}

export async function decideAction(
  prompt: string,
  tool: ChooseActionTool,
): Promise<{ choiceIndex: number; reasoning?: string }> {
  console.log("\n=== AI prompt ===\n" + prompt);
  console.log("=== AI tool schema ===\n" + JSON.stringify(tool, null, 2));

  const response = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    console.log("=== AI raw response (no tool_use) ===\n" + JSON.stringify(response, null, 2));
    throw new Error("Anthropic response did not include a tool_use block");
  }

  console.log("=== AI output ===\n" + JSON.stringify(toolUse.input, null, 2));

  const input = toolUse.input as { choiceIndex?: unknown; reasoning?: unknown };
  if (typeof input.choiceIndex !== "number") {
    throw new Error("Anthropic tool_use input missing a numeric choiceIndex");
  }

  return {
    choiceIndex: input.choiceIndex,
    reasoning: typeof input.reasoning === "string" ? input.reasoning : undefined,
  };
}
