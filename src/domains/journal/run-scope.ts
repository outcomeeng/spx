import { join } from "node:path";

import type { Result } from "@/config/types";
import { branchScopeDir, runFileName, runsDir } from "@/lib/state-store";

/**
 * The inputs that scope one journal run's local persistence path: the Git
 * common-dir product root, the state-store branch slug, the opaque caller-supplied
 * verification-type segment, and the run token identifying the run file.
 */
export interface JournalRunScope {
  /** The Git common-dir product root the `.spx/` store resolves under. */
  readonly productDir: string;
  /** The state-store branch slug the run is scoped to. */
  readonly branchSlug: string;
  /** The opaque verification-type segment; spx names no verification kind. */
  readonly type: string;
  /** The run token identifying this run's append-only journal file. */
  readonly runToken: string;
}

/**
 * Compose a journal run's local persistence path,
 * `.spx/branch/<branch-slug>/<type>/runs/run-<run-token>.jsonl`, at the Git
 * common-dir product root. The branch slug and the opaque `<type>` segment are
 * validated for path safety by the state-store; an invalid slug or type segment
 * rejects with the state-store error, never a partial path.
 */
export function journalRunFilePath(scope: JournalRunScope): Result<string> {
  const branchScope = branchScopeDir(scope.productDir, scope.branchSlug);
  if (!branchScope.ok) return branchScope;
  const typeRunsDir = runsDir(branchScope.value, scope.type);
  if (!typeRunsDir.ok) return typeRunsDir;
  return { ok: true, value: join(typeRunsDir.value, runFileName(scope.runToken)) };
}
