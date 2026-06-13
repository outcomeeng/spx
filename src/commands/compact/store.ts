import { readFile } from "node:fs/promises";

import { compactStashPath, extractCompactRecord, resolveCompactSessionToken } from "@/domains/compact";
import type { AgentSessionEnvironment } from "@/domains/session/agent-session";
import { appendJsonlRecord, resolveWorktreeScopeDir } from "@/lib/state-store";

export interface CompactStoreOptions {
  readonly transcript: string;
  readonly sessionId?: string;
  readonly cwd?: string;
  readonly env?: AgentSessionEnvironment;
}

const UTF8_ENCODING = "utf8";

export async function compactStoreCommand(options: CompactStoreOptions): Promise<0 | 1> {
  const sessionToken = resolveCompactSessionToken(options.sessionId, options.env ?? process.env);
  if (sessionToken === undefined) return 1;

  let transcript: string;
  try {
    transcript = await readFile(options.transcript, UTF8_ENCODING);
  } catch {
    return 1;
  }

  const record = extractCompactRecord(transcript);
  if (record === undefined) return 0;

  const worktreeScope = await resolveWorktreeScopeDir({ cwd: options.cwd });
  if (!worktreeScope.ok) return 1;
  const stashPath = compactStashPath(worktreeScope.value, sessionToken);
  if (!stashPath.ok) return 1;
  const written = await appendJsonlRecord(stashPath.value, record);
  return written.ok ? 0 : 1;
}
