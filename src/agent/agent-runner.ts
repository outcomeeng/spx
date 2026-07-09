/**
 * The dependency-injected boundary for agent-authored artifacts. A release child
 * supplies a prompt and a working directory; the runner drives the model to write
 * files under that directory and resolves once the agent run completes. The
 * production implementation wraps the Claude Agent SDK `query()` under a file
 * read/write/edit tool allowlist and a non-interactive permission mode; tests
 * inject a recording double that writes a modelled artifact.
 */
export interface AgentRunRequest {
  /** The system prompt assembled by the calling child from its own inputs. */
  readonly prompt: string;
  /** The directory the agent's file tools are scoped to and write within. */
  readonly workingDirectory: string;
  /** The tools the caller allows the agent boundary to expose. */
  readonly tools: readonly AgentRunTool[];
  /** The tools the caller authorizes for non-interactive execution. */
  readonly allowedTools: readonly AgentRunTool[];
  /** The non-interactive permission mode selected by the caller. */
  readonly permissionMode: AgentPermissionMode;
  /** The maximum turns the caller permits for the artifact-producing run. */
  readonly maxTurns: number;
}

/** The injected agent boundary: runs one agent turn that writes files in `workingDirectory`. */
export interface AgentRunner {
  run(request: AgentRunRequest): Promise<void>;
}

export const AGENT_RUN_TOOLS = {
  READ: "Read",
  WRITE: "Write",
  EDIT: "Edit",
} as const;
export type AgentRunTool = (typeof AGENT_RUN_TOOLS)[keyof typeof AGENT_RUN_TOOLS];
export const AGENT_PERMISSION_MODES = {
  DONT_ASK: "dontAsk",
} as const;
export type AgentPermissionMode = (typeof AGENT_PERMISSION_MODES)[keyof typeof AGENT_PERMISSION_MODES];
