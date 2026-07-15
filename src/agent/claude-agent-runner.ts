import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  CanUseTool,
  Options,
  PermissionResult,
  SDKMessage,
  SDKResultMessage,
  SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";

import {
  AGENT_PERMISSION_MODES,
  AGENT_RUN_TOOLS,
  AGENT_TOOL_PERMISSION_BEHAVIOR,
  type AgentAuditor,
  type AgentAuditRequest,
  type AgentRunner,
  type AgentRunRequest,
  type AgentRunTool,
  authorizeAgentFileToolPath,
} from "./agent-runner";

export const AGENT_FILE_TOOL_PATH_INPUT_FIELD = "file_path";
const AGENT_FILE_TOOL_PERMISSION_DENIED_MESSAGE = "Agent file tool target is outside its working directory";

export class ClaudeAgentRunner implements AgentRunner, AgentAuditor {
  async run(request: AgentRunRequest): Promise<void> {
    await runClaudeQuery(
      request.prompt,
      createAgentRunOptions(request),
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

export function createAgentRunOptions(request: AgentRunRequest): Options {
  return {
    cwd: request.workingDirectory,
    settingSources: [],
    tools: [...request.tools],
    allowedTools: autoAllowedAgentTools(request.allowedTools),
    canUseTool: createAgentToolPermission(request),
    permissionMode: request.permissionMode,
    maxTurns: request.maxTurns,
  };
}

function autoAllowedAgentTools(allowedTools: readonly AgentRunTool[]): AgentRunTool[] {
  return allowedTools.filter((tool) => !isAgentFileMutationTool(tool));
}

function createAgentToolPermission(request: AgentRunRequest): CanUseTool {
  return async (toolName, input) => {
    if (!isAgentRunTool(toolName) || !request.allowedTools.includes(toolName)) {
      return deniedAgentToolPermission();
    }
    if (!isAgentFileMutationTool(toolName)) {
      return { behavior: AGENT_TOOL_PERMISSION_BEHAVIOR.ALLOW, updatedInput: input };
    }
    const filePath = input[AGENT_FILE_TOOL_PATH_INPUT_FIELD];
    if (
      typeof filePath !== "string"
      || authorizeAgentFileToolPath(request.workingDirectory, toolName, filePath)
        === AGENT_TOOL_PERMISSION_BEHAVIOR.DENY
    ) {
      return deniedAgentToolPermission();
    }
    return { behavior: AGENT_TOOL_PERMISSION_BEHAVIOR.ALLOW, updatedInput: input };
  };
}

function deniedAgentToolPermission(): PermissionResult {
  return {
    behavior: AGENT_TOOL_PERMISSION_BEHAVIOR.DENY,
    message: AGENT_FILE_TOOL_PERMISSION_DENIED_MESSAGE,
  };
}

function isAgentRunTool(toolName: string): toolName is AgentRunTool {
  return Object.values(AGENT_RUN_TOOLS).some((tool) => tool === toolName);
}

function isAgentFileMutationTool(tool: AgentRunTool): boolean {
  return tool === AGENT_RUN_TOOLS.WRITE || tool === AGENT_RUN_TOOLS.EDIT;
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
