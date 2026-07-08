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

export const AGENT_SEARCH_DEFAULT_LIMIT = 20;

export const AGENT_SEARCH_MATCH_REASON = {
  ALL: "all",
  PICKUP_ID: "pickup-id",
  CONTAINS: "contains",
  SESSION_ID: "session-id",
  AGENT: "agent",
  BRANCH: "branch",
} as const;

export type AgentSearchMatchReason = (typeof AGENT_SEARCH_MATCH_REASON)[keyof typeof AGENT_SEARCH_MATCH_REASON];

export const AGENT_SESSION_JSON_FIELDS = {
  TIMESTAMP: "timestamp",
  TYPE: "type",
  CWD: "cwd",
  COMMAND: "command",
  CMD: "cmd",
  ARGS: "args",
  ARGUMENTS: "arguments",
  NAME: "name",
  CALL_ID: "call_id",
  OUTPUT: "output",
  MESSAGE: "message",
  CONTENT: "content",
  INPUT: "input",
  TOOL_USE_ID: "tool_use_id",
  IS_ERROR: "is_error",
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

export const AGENT_TRANSCRIPT_GIT_COMMAND = {
  EXECUTABLE: "git",
  SWITCH: "switch",
  CHECKOUT: "checkout",
  WORKTREE: "worktree",
  ADD: "add",
  TRACK: "--track",
  TRACK_SHORT: "-t",
  NO_TRACK: "--no-track",
  TRACK_DIRECT: "--track=direct",
  TRACK_INHERIT: "--track=inherit",
  CHANGE_DIRECTORY: "-C",
  CONFIG: "-c",
  GIT_DIR: "--git-dir",
  WORK_TREE: "--work-tree",
  NAMESPACE: "--namespace",
  CONFIG_ENV: "--config-env",
  EXEC_PATH: "--exec-path",
  HTML_PATH: "--html-path",
  MAN_PATH: "--man-path",
  INFO_PATH: "--info-path",
  PAGINATE_SHORT: "-p",
  PAGINATE: "--paginate",
  NO_PAGER: "--no-pager",
  NO_REPLACE_OBJECTS: "--no-replace-objects",
  NO_LAZY_FETCH: "--no-lazy-fetch",
  NO_OPTIONAL_LOCKS: "--no-optional-locks",
  NO_ADVICE: "--no-advice",
  BARE: "--bare",
  FORCE: "--force",
  FORCE_SHORT: "-f",
  QUIET: "--quiet",
  QUIET_SHORT: "-q",
  GUESS: "--guess",
  NO_GUESS: "--no-guess",
  CHECKOUT_WORKTREE: "--checkout",
  NO_CHECKOUT_WORKTREE: "--no-checkout",
  LOCK: "--lock",
  NO_LOCK: "--no-lock",
  GUESS_REMOTE: "--guess-remote",
  NO_GUESS_REMOTE: "--no-guess-remote",
  RELATIVE_PATHS: "--relative-paths",
  NO_RELATIVE_PATHS: "--no-relative-paths",
  IGNORE_OTHER_WORKTREES: "--ignore-other-worktrees",
  NO_IGNORE_OTHER_WORKTREES: "--no-ignore-other-worktrees",
  DISCARD_CHANGES: "--discard-changes",
  NO_DISCARD_CHANGES: "--no-discard-changes",
  MERGE: "--merge",
  MERGE_SHORT: "-m",
  OVERLAY: "--overlay",
  NO_OVERLAY: "--no-overlay",
  OVERWRITE_IGNORE: "--overwrite-ignore",
  NO_OVERWRITE_IGNORE: "--no-overwrite-ignore",
  PROGRESS: "--progress",
  NO_PROGRESS: "--no-progress",
  REASON: "--reason",
  RECURSE_SUBMODULES: "--recurse-submodules",
  NO_RECURSE_SUBMODULES: "--no-recurse-submodules",
  CONFLICT: "--conflict",
  PATHSPEC_SEPARATOR: "--",
  CREATE_BRANCH_SHORT: "-b",
  CREATE_REFLOG_SHORT: "-l",
  CREATE_BRANCH_LONG: "-c",
  CREATE_BRANCH_RESET_SHORT: "-B",
  CREATE_BRANCH_SWITCH_RESET_SHORT: "-C",
  CREATE_BRANCH_SWITCH_LONG: "--create",
  CREATE_BRANCH_SWITCH_RESET_LONG: "--force-create",
  DETACH: "--detach",
  ORPHAN: "--orphan",
} as const;

export const AGENT_SESSION_ROW_TYPE = {
  CODEX_SESSION_META: "session_meta",
  CODEX_RESPONSE_ITEM: "response_item",
  CLAUDE_ASSISTANT: "assistant",
  CLAUDE_USER: "user",
} as const;

export const AGENT_TRANSCRIPT_PAYLOAD_TYPE = {
  FUNCTION_CALL: "function_call",
  FUNCTION_CALL_OUTPUT: "function_call_output",
} as const;

export const AGENT_TRANSCRIPT_TOOL_NAME = {
  CODEX_EXEC_COMMAND: "exec_command",
  CLAUDE_BASH: "Bash",
} as const;

export const AGENT_TRANSCRIPT_CONTENT_TYPE = {
  TOOL_USE: "tool_use",
  TOOL_RESULT: "tool_result",
} as const;

export const AGENT_TRANSCRIPT_CODEX_OUTPUT = {
  PROCESS_EXITED_WITH_CODE: "Process exited with code",
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
