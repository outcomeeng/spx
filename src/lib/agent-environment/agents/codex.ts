/**
 * The Codex agent module: every fact spx needs about Codex.
 *
 * @module lib/agent-environment/agents/codex
 */

import {
  AGENT_LISTING_CONTAINER,
  AGENT_TRANSCRIPT_BRANCH_ROWS,
  AGENT_TRANSCRIPT_LOCATION,
  AGENT_WORKING_DIRECTORY_FORM,
  type AgentModule,
} from "@/lib/agent-environment/agent-module";
import { METHODOLOGY_CODING_AGENT } from "@/lib/methodology";

const CODEX_EXECUTABLE = "codex";

export const CODEX_AGENT = {
  id: CODEX_EXECUTABLE,
  identityVariable: "CODEX_THREAD_ID",
  compactStdoutDefault: false,
  methodologyBundle: METHODOLOGY_CODING_AGENT.CODEX,
  defaultMethodologyBundle: false,
  home: {
    variable: "CODEX_HOME",
    userScopeDirectory: ".codex",
  },
  sessionStore: {
    directory: "sessions",
    transcriptExtension: ".jsonl",
    transcriptLocation: AGENT_TRANSCRIPT_LOCATION.OPENING_ROW,
    branchRows: AGENT_TRANSCRIPT_BRANCH_ROWS.OPENING_ROW,
    openingRowType: "session_meta",
    workingDirectoryRecords: [
      { recordType: "turn_context", form: AGENT_WORKING_DIRECTORY_FORM.PATH, field: "payload.cwd" },
      { recordType: "CommandExecution", form: AGENT_WORKING_DIRECTORY_FORM.FILE_URI, field: "payload.item.cwd" },
    ],
  },
  processName: CODEX_EXECUTABLE,
  pluginListing: {
    command: { executable: CODEX_EXECUTABLE, args: ["plugin", "list", "--json"] },
    container: AGENT_LISTING_CONTAINER.PROPERTY,
    property: "installed",
    entryFields: ["name", "enabled"],
  },
  marketplaceListing: {
    command: { executable: CODEX_EXECUTABLE, args: ["plugin", "marketplace", "list", "--json"] },
    container: AGENT_LISTING_CONTAINER.PROPERTY,
    property: "marketplaces",
    entryFields: ["name", "root", "marketplaceSource.sourceType", "marketplaceSource.source"],
  },
  installs: true,
} as const satisfies AgentModule;
