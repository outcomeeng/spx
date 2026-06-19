import { compactStashPath, parseCompactRecord, resolveCompactSessionToken } from "@/domains/compact";
import type { AgentSessionEnvironment } from "@/domains/session/agent-session";
import { readLatestJsonlRecord, resolveWorktreeScopeDir } from "@/lib/state-store";

export interface CompactRetrieveOptions {
  readonly sessionId?: string;
  readonly cwd?: string;
  readonly env?: AgentSessionEnvironment;
}

export interface CompactRetrieveResult {
  readonly exitCode: 0 | 1;
  readonly output: string;
}

const EMPTY_OUTPUT = "";

export async function compactRetrieveCommand(options: CompactRetrieveOptions): Promise<CompactRetrieveResult> {
  const sessionToken = resolveCompactSessionToken(options.sessionId, options.env ?? process.env);
  if (sessionToken === undefined) return { exitCode: 1, output: EMPTY_OUTPUT };

  const worktreeScope = await resolveWorktreeScopeDir({ cwd: options.cwd });
  const stashPath = compactStashPath(worktreeScope, sessionToken);
  if (!stashPath.ok) return { exitCode: 1, output: EMPTY_OUTPUT };
  const latest = await readLatestJsonlRecord(stashPath.value);
  if (!latest.ok || latest.value === undefined) return { exitCode: 1, output: EMPTY_OUTPUT };
  const record = parseCompactRecord(latest.value);
  if (!record.ok) return { exitCode: 1, output: EMPTY_OUTPUT };
  return { exitCode: 0, output: `${JSON.stringify(record.value)}\n` };
}
