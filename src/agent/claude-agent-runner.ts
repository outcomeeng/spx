import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  HookCallback,
  Options,
  SDKMessage,
  SDKResultMessage,
  SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";

import {
  AGENT_FILE_TOOLS,
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
export const AGENT_PRE_TOOL_USE_HOOK_EVENT = "PreToolUse";
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
    allowedTools: [...request.allowedTools],
    hooks: {
      PreToolUse: [{ hooks: [createAgentFileToolPermissionHook(request)] }],
    },
    permissionMode: request.permissionMode,
    maxTurns: request.maxTurns,
  };
}

function createAgentFileToolPermissionHook(request: AgentRunRequest): HookCallback {
  return async (input) => {
    if (
      input.hook_event_name !== AGENT_PRE_TOOL_USE_HOOK_EVENT
      || !isAgentRunTool(input.tool_name)
      || !request.allowedTools.includes(input.tool_name)
      || !isRecord(input.tool_input)
    ) {
      return deniedAgentFileToolPermission();
    }
    if (!isAgentFileTool(input.tool_name)) {
      return allowedAgentFileToolPermission();
    }
    const filePath = input.tool_input[AGENT_FILE_TOOL_PATH_INPUT_FIELD];
    if (
      typeof filePath !== "string"
      || authorizeAgentFileToolPath(request.workingDirectory, input.tool_name, filePath)
        === AGENT_TOOL_PERMISSION_BEHAVIOR.DENY
    ) {
      return deniedAgentFileToolPermission();
    }
    return allowedAgentFileToolPermission();
  };
}

function allowedAgentFileToolPermission() {
  return {
    hookSpecificOutput: {
      hookEventName: AGENT_PRE_TOOL_USE_HOOK_EVENT,
      permissionDecision: AGENT_TOOL_PERMISSION_BEHAVIOR.ALLOW,
    },
  } as const;
}

function deniedAgentFileToolPermission() {
  return {
    hookSpecificOutput: {
      hookEventName: AGENT_PRE_TOOL_USE_HOOK_EVENT,
      permissionDecision: AGENT_TOOL_PERMISSION_BEHAVIOR.DENY,
      permissionDecisionReason: AGENT_FILE_TOOL_PERMISSION_DENIED_MESSAGE,
    },
  } as const;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function isAgentRunTool(toolName: string): toolName is AgentRunTool {
  return Object.values(AGENT_RUN_TOOLS).some((tool) => tool === toolName);
}

function isAgentFileTool(tool: AgentRunTool): boolean {
  return AGENT_FILE_TOOLS.includes(tool);
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
