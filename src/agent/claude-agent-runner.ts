import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

import type { AgentRunner, AgentRunRequest } from "./agent-runner";

const RELEASE_ARTIFACT_TOOLS = ["Read", "Write", "Edit"] as const;
const RELEASE_AGENT_MAX_TURNS = 12;

export class ClaudeAgentRunner implements AgentRunner {
  async run(request: AgentRunRequest): Promise<void> {
    let result: SDKResultMessage | undefined;
    for await (
      const message of query({
        prompt: request.prompt,
        options: {
          cwd: request.workingDirectory,
          tools: [...RELEASE_ARTIFACT_TOOLS],
          allowedTools: [...RELEASE_ARTIFACT_TOOLS],
          permissionMode: "dontAsk",
          maxTurns: RELEASE_AGENT_MAX_TURNS,
        },
      })
    ) {
      if (isResultMessage(message)) {
        result = message;
      }
    }
    if (result === undefined) {
      throw new Error("Claude agent run completed without a result message");
    }
    if (result.subtype !== "success") {
      throw new Error(`Claude agent run failed: ${result.errors.join("; ")}`);
    }
  }
}

function isResultMessage(message: SDKMessage): message is SDKResultMessage {
  return message.type === "result";
}
