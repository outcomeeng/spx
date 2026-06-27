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
  JSONL_EXTENSION: ".jsonl",
  TEXT_ENCODING: "utf8",
} as const;

export const AGENT_RESUME_LIMITS = {
  RECENT_DAYS: 7,
  DISPLAYED_CANDIDATES: 20,
  HOURS_PER_DAY: 24,
  MINUTES_PER_HOUR: 60,
  SECONDS_PER_MINUTE: 60,
  MILLISECONDS_PER_SECOND: 1000,
} as const;

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
} as const;

export const AGENT_SESSION_JSON_FIELDS = {
  TIMESTAMP: "timestamp",
  CWD: "cwd",
  SESSION_ID: "session_id",
  SESSION_ID_CAMEL: "sessionId",
  ID: "id",
  PAYLOAD: "payload",
  GIT_BRANCH: "gitBranch",
} as const;

export const AGENT_RESUME_RECENT_WINDOW_MS = AGENT_RESUME_LIMITS.RECENT_DAYS
  * AGENT_RESUME_LIMITS.HOURS_PER_DAY
  * AGENT_RESUME_LIMITS.MINUTES_PER_HOUR
  * AGENT_RESUME_LIMITS.SECONDS_PER_MINUTE
  * AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND;
