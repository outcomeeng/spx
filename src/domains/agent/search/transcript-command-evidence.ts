import {
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_ROW_TYPE,
  AGENT_TRANSCRIPT_CODEX_OUTPUT,
  AGENT_TRANSCRIPT_CONTENT_TYPE,
  AGENT_TRANSCRIPT_PAYLOAD_TYPE,
  AGENT_TRANSCRIPT_TOOL_NAME,
} from "../protocol";
import { firstString, isRecord, parseJsonObject, valueAtPath } from "../transcript-json";
import { gitCommandAssociatesBranch } from "./git-branch-evidence";
import { shellWords } from "./shell-command";

export function transcriptHasAcceptedBranchCommand(content: string, branch: string): boolean {
  return transcriptBranchCommandEvidence(content).some((evidence) =>
    evidence.completed && evidence.succeeded && gitCommandAssociatesBranch(evidence.words, branch)
  );
}

interface TranscriptBranchCommandEvidence {
  readonly words: readonly string[];
  completed: boolean;
  succeeded: boolean;
}

function transcriptBranchCommandEvidence(content: string): readonly TranscriptBranchCommandEvidence[] {
  const evidence: TranscriptBranchCommandEvidence[] = [];
  const codexCalls = new Map<string, TranscriptBranchCommandEvidence>();
  const claudeToolUses = new Map<string, TranscriptBranchCommandEvidence>();
  const completedCodexCallIds = new Set<string>();
  const completedClaudeToolUseIds = new Set<string>();
  const succeededCodexCallIds = new Set<string>();
  const succeededClaudeToolUseIds = new Set<string>();
  for (const line of content.split("\n")) {
    const row = parseJsonObject(line);
    if (row === null) {
      continue;
    }
    collectCodexCommandEvidence(row, evidence, codexCalls, completedCodexCallIds, succeededCodexCallIds);
    collectClaudeCommandEvidence(row, evidence, claudeToolUses, completedClaudeToolUseIds, succeededClaudeToolUseIds);
  }
  return evidence;
}

function collectCodexCommandEvidence(
  row: Record<string, unknown>,
  evidence: TranscriptBranchCommandEvidence[],
  calls: Map<string, TranscriptBranchCommandEvidence>,
  completedCallIds: Set<string>,
  succeededCallIds: Set<string>,
): void {
  if (firstString(row, [[AGENT_SESSION_JSON_FIELDS.TYPE]]) !== AGENT_SESSION_ROW_TYPE.CODEX_RESPONSE_ITEM) {
    return;
  }
  const payload = valueAtPath(row, [AGENT_SESSION_JSON_FIELDS.PAYLOAD]);
  if (!isRecord(payload)) {
    return;
  }
  const payloadType = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.TYPE]]);
  if (payloadType === AGENT_TRANSCRIPT_PAYLOAD_TYPE.FUNCTION_CALL) {
    const command = codexFunctionCallWords(payload);
    if (command === null) {
      return;
    }
    const rowEvidence: TranscriptBranchCommandEvidence = {
      words: command,
      completed: false,
      succeeded: false,
    };
    const callId = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.CALL_ID]]);
    if (callId !== null) {
      rowEvidence.completed = completedCallIds.has(callId);
      rowEvidence.succeeded = succeededCallIds.has(callId);
      calls.set(callId, rowEvidence);
    }
    evidence.push(rowEvidence);
    return;
  }
  if (payloadType !== AGENT_TRANSCRIPT_PAYLOAD_TYPE.FUNCTION_CALL_OUTPUT) {
    return;
  }
  const callId = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.CALL_ID]]);
  if (callId === null) {
    return;
  }
  completedCallIds.add(callId);
  const command = calls.get(callId);
  if (command !== undefined) {
    command.completed = true;
  }
  if (!codexFunctionCallOutputSucceeded(payload)) {
    return;
  }
  succeededCallIds.add(callId);
  if (command !== undefined) {
    command.succeeded = true;
  }
}

function codexFunctionCallWords(payload: Record<string, unknown>): readonly string[] | null {
  const toolName = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.NAME]]);
  if (toolName !== AGENT_TRANSCRIPT_TOOL_NAME.CODEX_EXEC_COMMAND) {
    return null;
  }
  const rawArguments = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.ARGUMENTS]]);
  if (rawArguments === null) {
    return null;
  }
  const args = parseJsonObject(rawArguments);
  if (args === null) {
    return null;
  }
  const command = firstString(args, [
    [AGENT_SESSION_JSON_FIELDS.CMD],
    [AGENT_SESSION_JSON_FIELDS.COMMAND],
  ]);
  if (command !== null) {
    return shellWords(command);
  }
  const commandArgs = valueAtPath(args, [AGENT_SESSION_JSON_FIELDS.ARGS]);
  return stringArray(commandArgs);
}

const CODEX_OUTPUT_EXIT_CODE_PATTERN = new RegExp(
  String.raw`${AGENT_TRANSCRIPT_CODEX_OUTPUT.PROCESS_EXITED_WITH_CODE}\s+(\d+)`,
  "u",
);

function codexFunctionCallOutputSucceeded(payload: Record<string, unknown>): boolean {
  const output = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.OUTPUT]]);
  if (output === null) {
    return false;
  }
  const match = CODEX_OUTPUT_EXIT_CODE_PATTERN.exec(output);
  return match !== null && Number(match[1]) === 0;
}

function collectClaudeCommandEvidence(
  row: Record<string, unknown>,
  evidence: TranscriptBranchCommandEvidence[],
  toolUses: Map<string, TranscriptBranchCommandEvidence>,
  completedToolUseIds: Set<string>,
  succeededToolUseIds: Set<string>,
): void {
  const content = valueAtPath(row, [AGENT_SESSION_JSON_FIELDS.MESSAGE, AGENT_SESSION_JSON_FIELDS.CONTENT]);
  if (!Array.isArray(content)) {
    return;
  }
  for (const item of content) {
    if (!isRecord(item)) {
      continue;
    }
    const itemType = firstString(item, [[AGENT_SESSION_JSON_FIELDS.TYPE]]);
    if (itemType === AGENT_TRANSCRIPT_CONTENT_TYPE.TOOL_USE) {
      collectClaudeToolUse(item, evidence, toolUses, completedToolUseIds, succeededToolUseIds);
    } else if (itemType === AGENT_TRANSCRIPT_CONTENT_TYPE.TOOL_RESULT) {
      collectClaudeToolResult(item, toolUses, completedToolUseIds, succeededToolUseIds);
    }
  }
}

function collectClaudeToolUse(
  item: Record<string, unknown>,
  evidence: TranscriptBranchCommandEvidence[],
  toolUses: Map<string, TranscriptBranchCommandEvidence>,
  completedToolUseIds: Set<string>,
  succeededToolUseIds: Set<string>,
): void {
  const toolName = firstString(item, [[AGENT_SESSION_JSON_FIELDS.NAME]]);
  if (toolName !== AGENT_TRANSCRIPT_TOOL_NAME.CLAUDE_BASH) {
    return;
  }
  const command = firstString(item, [[AGENT_SESSION_JSON_FIELDS.INPUT, AGENT_SESSION_JSON_FIELDS.COMMAND]]);
  if (command === null) {
    return;
  }
  const rowEvidence: TranscriptBranchCommandEvidence = {
    words: shellWords(command),
    completed: false,
    succeeded: false,
  };
  const toolUseId = firstString(item, [[AGENT_SESSION_JSON_FIELDS.ID]]);
  if (toolUseId !== null) {
    rowEvidence.completed = completedToolUseIds.has(toolUseId);
    rowEvidence.succeeded = succeededToolUseIds.has(toolUseId);
    toolUses.set(toolUseId, rowEvidence);
  }
  evidence.push(rowEvidence);
}

function collectClaudeToolResult(
  item: Record<string, unknown>,
  toolUses: Map<string, TranscriptBranchCommandEvidence>,
  completedToolUseIds: Set<string>,
  succeededToolUseIds: Set<string>,
): void {
  const toolUseId = firstString(item, [[AGENT_SESSION_JSON_FIELDS.TOOL_USE_ID]]);
  if (toolUseId === null) {
    return;
  }
  completedToolUseIds.add(toolUseId);
  const command = toolUses.get(toolUseId);
  if (command !== undefined) {
    command.completed = true;
  }
  if (valueAtPath(item, [AGENT_SESSION_JSON_FIELDS.IS_ERROR]) !== false) {
    return;
  }
  succeededToolUseIds.add(toolUseId);
  if (command !== undefined) {
    command.succeeded = true;
  }
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string" && item.length > 0)
    ? value
    : null;
}
