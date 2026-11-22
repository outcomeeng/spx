/**
 * The Antigravity agent module: every fact spx needs about Antigravity. spx sets no agent home for
 * it, reads no session store of it, and installs nothing for it.
 *
 * @module lib/agent-environment/agents/antigravity
 */

import { AGENT_LISTING_CONTAINER, type AgentModule } from "@/lib/agent-environment/agent-module";

const ANTIGRAVITY_EXECUTABLE = "agy";

export const ANTIGRAVITY_AGENT = {
  id: "antigravity",
  identityVariable: "ANTIGRAVITY_CONVERSATION_ID",
  compactStdoutDefault: false,
  defaultMethodologyBundle: false,
  userScope: {
    configurationDirectory: ".gemini/antigravity-cli",
    pluginDirectory: ".gemini/config/plugins",
  },
  processName: ANTIGRAVITY_EXECUTABLE,
  pluginListing: {
    command: { executable: ANTIGRAVITY_EXECUTABLE, args: ["plugin", "list", "--json"] },
    container: AGENT_LISTING_CONTAINER.ARRAY,
    entryFields: ["name", "enabled", "version", "source", "path", "skills"],
  },
  installs: false,
} as const satisfies AgentModule;
