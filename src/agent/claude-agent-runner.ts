import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage, SDKResultMessage, SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk";

import { AGENT_PERMISSION_MODES } from "./agent-runner";
import type { AgentAuditor, AgentAuditRequest, AgentRunner, AgentRunRequest } from "./agent-runner";

export class ClaudeAgentRunner implements AgentRunner, AgentAuditor {
  async run(request: AgentRunRequest): Promise<void> {
    await runClaudeQuery(
      request.prompt,
      {
        cwd: request.workingDirectory,
        settingSources: [],
        tools: [...request.tools],
        allowedTools: [...request.allowedTools],
        permissionMode: request.permissionMode,
        maxTurns: request.maxTurns,
      },
    );
  }

  async audit(request: AgentAuditRequest): Promise<string> {
    const result = await runClaudeQuery(
      request.prompt,
      {
        cwd: request.workingDirectory,
        settingSources: [],
        tools: [],
        allowedTools: [],
        permissionMode: AGENT_PERMISSION_MODES.DONT_ASK,
        maxTurns: request.maxTurns,
      },
    );
    return result.result;
  }
}

async function runClaudeQuery(prompt: string, options: Options): Promise<SDKResultSuccess> {
  let result: SDKResultMessage | undefined;
  for await (
    const message of query({
      prompt,
      options,
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
  return result;
}

function isResultMessage(message: SDKMessage): message is SDKResultMessage {
  return message.type === "result";
}
