import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

import type { AgentRunner, AgentRunRequest } from "./agent-runner";

export class ClaudeAgentRunner implements AgentRunner {
  async run(request: AgentRunRequest): Promise<void> {
    let result: SDKResultMessage | undefined;
    for await (
      const message of query({
        prompt: request.prompt,
        options: {
          cwd: request.workingDirectory,
          tools: [...request.tools],
          allowedTools: [...request.allowedTools],
          permissionMode: request.permissionMode,
          maxTurns: request.maxTurns,
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
