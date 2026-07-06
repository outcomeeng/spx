export const AGENT_SESSION_KIND = {
  CODEX: "codex",
  CLAUDE_CODE: "claude-code",
} as const;

export type AgentSessionKind = (typeof AGENT_SESSION_KIND)[keyof typeof AGENT_SESSION_KIND];

export const AGENT_SESSION_LABEL: Readonly<Record<AgentSessionKind, string>> = {
  [AGENT_SESSION_KIND.CODEX]: "Codex",
  [AGENT_SESSION_KIND.CLAUDE_CODE]: "Claude Code",
};

export const AGENT_RESUME_COMMAND = {
  CODEX_BINARY: "codex",
  CODEX_RESUME: "resume",
  CLAUDE_BINARY: "claude",
  CLAUDE_RESUME: "--resume",
} as const;

export const AGENT_SESSION_STORE = {
  CODEX_DIR: ".codex",
  CODEX_SESSIONS_DIR: "sessions",
  CLAUDE_DIR: ".claude",
  CLAUDE_PROJECTS_DIR: "projects",
  CLAUDE_SUBAGENTS_DIR: "subagents",
  JSONL_EXTENSION: ".jsonl",
  TEXT_ENCODING: "utf8",
} as const;

export const AGENT_RESUME_LIMITS = {
  RECENT_DAYS: 7,
  PER_AGENT_DISPLAYED_CANDIDATES: 5,
  METADATA_HEAD_BYTES: 131_072,
  ACTIVITY_TAIL_BYTES: 131_072,
  HOURS_PER_DAY: 24,
  MINUTES_PER_HOUR: 60,
  SECONDS_PER_MINUTE: 60,
  MILLISECONDS_PER_SECOND: 1000,
  READ_CONCURRENCY: 8,
} as const;

export const AGENT_RESUME_SCOPE = {
  WORKTREE: "worktree",
  BRANCH: "branch",
} as const;

export type AgentResumeScopeKind = (typeof AGENT_RESUME_SCOPE)[keyof typeof AGENT_RESUME_SCOPE];

export const AGENT_RESUME_MODE = {
  PICK: "pick",
  LATEST: "latest",
  LIST: "list",
  JSON: "json",
} as const;

export type AgentResumeMode = (typeof AGENT_RESUME_MODE)[keyof typeof AGENT_RESUME_MODE];

export const AGENT_RESUME_TEXT = {
  NO_MATCHES: "No matching agent sessions found.",
  INTERACTIVE_REQUIRED: "agent resume requires an interactive terminal.",
  MODE_CONFLICT: "Choose only one resume mode",
} as const;

export const AGENT_SESSION_JSON_FIELDS = {
  TIMESTAMP: "timestamp",
  TYPE: "type",
  CWD: "cwd",
  COMMAND: "command",
  EXIT_CODE: "exitCode",
  STATUS: "status",
  SUCCESS: "success",
  ORIGINATOR: "originator",
  SOURCE: "source",
  SESSION_ID: "session_id",
  SESSION_ID_CAMEL: "sessionId",
  ID: "id",
  PAYLOAD: "payload",
  GIT: "git",
  BRANCH: "branch",
  GIT_BRANCH: "gitBranch",
  THREAD_SOURCE: "thread_source",
} as const;

export const AGENT_TRANSCRIPT_COMMAND_STATUS = {
  FAILED: "failed",
  FAILURE: "failure",
  ERROR: "error",
} as const;

export const AGENT_TRANSCRIPT_GIT_COMMAND = {
  EXECUTABLE: "git",
  SWITCH: "switch",
  CHECKOUT: "checkout",
  WORKTREE: "worktree",
  ADD: "add",
  CREATE_BRANCH_SHORT: "-b",
  CREATE_BRANCH_LONG: "-c",
  DETACH: "--detach",
  ORPHAN: "--orphan",
} as const;

export const AGENT_SESSION_ROW_TYPE = {
  CODEX_SESSION_META: "session_meta",
} as const;

export const CODEX_SESSION_ORIGINATOR = {
  TUI: "codex-tui",
  CLI: "codex_cli",
  VSCODE: "codex_vscode",
  VSCODE_HYPHEN: "codex-vscode",
  EXEC: "codex-exec",
} as const;

export const CODEX_SESSION_THREAD_SOURCE = {
  SUBAGENT: "subagent",
} as const;

export const AGENT_RESUME_RECENT_WINDOW_MS = AGENT_RESUME_LIMITS.RECENT_DAYS
  * AGENT_RESUME_LIMITS.HOURS_PER_DAY
  * AGENT_RESUME_LIMITS.MINUTES_PER_HOUR
  * AGENT_RESUME_LIMITS.SECONDS_PER_MINUTE
  * AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND;
