/**
 * The Claude Code agent module: every fact spx needs about Claude Code.
 *
 * @module lib/agent-environment/agents/claude-code
 */

import {
  AGENT_LISTING_CONTAINER,
  AGENT_TRANSCRIPT_BRANCH_ROWS,
  AGENT_TRANSCRIPT_LOCATION,
  type AgentModule,
} from "@/lib/agent-environment/agent-module";
import { METHODOLOGY_CODING_AGENT } from "@/lib/methodology";

const CLAUDE_CODE_EXECUTABLE = "claude";

export const CLAUDE_CODE_AGENT = {
  id: "claudeCode",
  identityVariable: "CLAUDE_CODE_SESSION_ID",
  compactStdoutDefault: true,
  methodologyBundle: METHODOLOGY_CODING_AGENT.CLAUDE,
  defaultMethodologyBundle: true,
  home: {
    variable: "CLAUDE_CONFIG_DIR",
    userScopeDirectory: ".claude",
  },
  sessionStore: {
    directory: "projects",
    transcriptExtension: ".jsonl",
    transcriptLocation: AGENT_TRANSCRIPT_LOCATION.PROJECT_DIRECTORY,
    branchRows: AGENT_TRANSCRIPT_BRANCH_ROWS.EVERY_ROW,
    workingDirectoryRecords: [],
  },
  processName: CLAUDE_CODE_EXECUTABLE,
  pluginListing: {
    command: { executable: CLAUDE_CODE_EXECUTABLE, args: ["plugin", "list", "--json"] },
    container: AGENT_LISTING_CONTAINER.ARRAY,
    entryFields: ["id", "enabled"],
  },
  marketplaceListing: {
    command: { executable: CLAUDE_CODE_EXECUTABLE, args: ["plugin", "marketplace", "list", "--json"] },
    container: AGENT_LISTING_CONTAINER.ARRAY,
    entryFields: ["name", "source", "url", "installLocation"],
  },
  installs: true,
} as const satisfies AgentModule;
