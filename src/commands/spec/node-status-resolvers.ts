import { listJournalRuns, readJournalEvents } from "@/commands/journal/runtime";
import { JOURNAL_RUN_SEALED_FILTER } from "@/domains/journal/run-scope";
import {
  AUDIT_CLAIM_ENTRY_SECTION,
  auditClaimEntry,
  CLAIM_EVIDENCE_KIND,
  type ClaimEvidenceKind,
} from "@/domains/verify/audit-claim-entry";
import {
  headCommitOf,
  projectVerifyRun,
  runJudgedPathsOf,
  validateTestScope,
  VERIFY_APPEND_EVENT_FIELD,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_VERIFICATION_TYPE,
  type VerifyVerificationType,
} from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE, type JournalEvent, type JsonValue } from "@/lib/agent-run-journal";
import { defaultGitDependencies, detectGitCommonDirProductRoot, type GitDependencies } from "@/lib/git/root";
import {
  createPinChangeReader,
  NODE_STATUS_MALLEABILITY,
  type NodeAttributedRequest,
  type NodeAttributedResult,
  type NodeAttributedResultResolver,
  type NodeAttributedResults,
  type NodeOutcomeResolver,
  type NodeReadPathResolver,
  type PinChangeReader,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { type StateStoreFileSystem } from "@/lib/state-store";

import { createNodeOutcomeResolver, type NodeOutcomeResolverDependencies } from "./node-outcome-resolver";

const PATH_SEPARATOR = "/";

/** Dependencies the production status resolvers compose over the testing domain and the verification journals. */
export interface NodeStatusResolverDependencies extends NodeOutcomeResolverDependencies {
  /** Git runner for the journals' product root and for freshness against a run's head commit. */
  readonly git?: GitDependencies;
  readonly journalFs?: StateStoreFileSystem;
}

/** The three resolvers `spx spec status --update` injects into the node-status orchestration. */
export interface NodeStatusResolvers {
  readonly resolveOutcome: NodeOutcomeResolver;
  readonly resolveReadPaths: NodeReadPathResolver;
  readonly resolveAttributedResults: NodeAttributedResultResolver;
}

/** One sealed verification run read from its journal. */
interface SealedRun {
  readonly runToken: string;
  readonly events: readonly JournalEvent[];
  /** The head commit the run judged; a run that recorded none cannot be checked for freshness. */
  readonly headCommit: string | undefined;
}

/** A module's read paths with the run that recorded them. */
interface ModuleReadPaths {
  readonly moduleId: string;
  readonly readPaths: readonly string[];
  readonly headCommit: string | undefined;
}

function isJsonRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builds the resolvers `--update` injects. Outcomes come from recorded last-run evidence; the paths a
 * result read come from the scope events of the latest sealed `test` run journal that covers the
 * reference, for a language whose adapter supplies them; `evidence` results come from sealed `audit`
 * run journals. Every journal read is memoized for the pass, a run whose judged paths changed since its
 * head commit supplies nothing, and no resolver executes verification.
 */
export function createNodeStatusResolvers(deps: NodeStatusResolverDependencies): NodeStatusResolvers {
  const git = deps.git ?? defaultGitDependencies;
  const runsByType = new Map<VerifyVerificationType, Promise<readonly SealedRun[]>>();
  const sealedRuns = (type: VerifyVerificationType): Promise<readonly SealedRun[]> => {
    const cached = runsByType.get(type);
    if (cached !== undefined) return cached;
    const read = readSealedRuns(deps, git, type);
    runsByType.set(type, read);
    return read;
  };
  const pinChanges = createPinChangeReader({ productDir: deps.productDir, git });
  let moduleReadPaths: Promise<readonly ModuleReadPaths[]> | undefined;
  const modules = (): Promise<
    readonly ModuleReadPaths[]
  > => (moduleReadPaths ??= sealedRuns(VERIFY_VERIFICATION_TYPE.TEST).then(newestModuleReadPaths));

  return {
    resolveOutcome: createNodeOutcomeResolver(deps),
    resolveReadPaths: async (_nodeId, evidencePath) => {
      if (!suppliesReadPaths(deps, evidencePath)) return undefined;
      const module = (await modules()).find((candidate) => moduleCovers(candidate.moduleId, evidencePath));
      if (module === undefined) return undefined;
      return await unchangedSince(pinChanges, module.headCommit, module.readPaths) ? module.readPaths : undefined;
    },
    resolveAttributedResults: async (nodeId, request) => ({
      evidence: await evidenceResults(await sealedRuns(VERIFY_VERIFICATION_TYPE.AUDIT), pinChanges, nodeId, request),
    }),
  };
}

/** Whether a language whose adapter supplies read paths owns the evidence path. */
function suppliesReadPaths(deps: NodeStatusResolverDependencies, evidencePath: string): boolean {
  return deps.registry.languages.some((language) =>
    language.suppliesReadPaths && language.matchesTestFile(evidencePath)
  );
}

/** Whether a journaled module identity names the product-relative evidence path. */
function moduleCovers(moduleId: string, evidencePath: string): boolean {
  return moduleId === evidencePath || moduleId.endsWith(`${PATH_SEPARATOR}${evidencePath}`);
}

/** Whether no judged path differs between the run's head commit and the checkout; a run with no head commit has no anchor. */
async function unchangedSince(
  pinChanges: PinChangeReader,
  headCommit: string | undefined,
  paths: readonly string[],
): Promise<boolean> {
  if (headCommit === undefined) return false;
  const changed = await pinChanges.changedPaths(headCommit);
  return changed !== undefined && paths.every((path) => !changed.has(path));
}

/** Every sealed run of the type across the branch scopes of the Git common-dir store, newest first. */
async function readSealedRuns(
  deps: NodeStatusResolverDependencies,
  git: GitDependencies,
  type: VerifyVerificationType,
): Promise<readonly SealedRun[]> {
  const options = deps.journalFs === undefined ? {} : { fs: deps.journalFs };
  const { productDir } = await detectGitCommonDirProductRoot(deps.productDir, git);
  const listed = await listJournalRuns(
    { productDir, type, sealed: JOURNAL_RUN_SEALED_FILTER.SEALED, limit: Number.POSITIVE_INFINITY },
    options,
  );
  if (!listed.ok) return [];
  const runs: SealedRun[] = [];
  for (const run of listed.value) {
    const events = await readJournalEvents(
      { productDir, branchSlug: run.branchSlug, type, runToken: run.runToken },
      JOURNAL_SEQ_BASE,
      options,
    );
    if (events.ok) runs.push({ runToken: run.runToken, events: events.value, headCommit: headCommitOf(events.value) });
  }
  return runs;
}

/** The read paths of each module, taken from the newest run that covered it. */
function newestModuleReadPaths(runs: readonly SealedRun[]): readonly ModuleReadPaths[] {
  const newest = new Map<string, ModuleReadPaths>();
  for (const run of runs) {
    for (const event of run.events) {
      if (event.type !== VERIFY_APPEND_EVENT_TYPE.SCOPE || !isJsonRecord(event.data)) continue;
      const scope = validateTestScope(event.data[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]);
      if (!scope.ok || newest.has(scope.value.moduleId)) continue;
      newest.set(scope.value.moduleId, {
        moduleId: scope.value.moduleId,
        readPaths: scope.value.readPaths ?? [],
        headCommit: run.headCommit,
      });
    }
  }
  return [...newest.values()];
}

const LINKED_EVIDENCE_KINDS: ReadonlySet<string> = new Set(Object.values(CLAIM_EVIDENCE_KIND));

/** Whether a unit's subject lies in the node's directory. */
function subjectInNode(subject: string, nodeId: string): boolean {
  const nodePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}${nodeId}`;
  return subject === nodePath || subject.startsWith(`${nodePath}${PATH_SEPARATOR}`);
}

/** The `evidence` results the node's requested kinds take from the newest sealed audit run that yields one. */
async function evidenceResults(
  runs: readonly SealedRun[],
  pinChanges: PinChangeReader,
  nodeId: string,
  request: NodeAttributedRequest,
): Promise<NonNullable<NodeAttributedResults["evidence"]>> {
  const linkedEvidenceKinds = request.evidenceKinds.filter((kind): kind is ClaimEvidenceKind =>
    LINKED_EVIDENCE_KINDS.has(kind)
  );
  const results: Record<string, NodeAttributedResult> = {};
  for (const run of runs) {
    const projection = projectVerifyRun(run.events);
    const entry = auditClaimEntry(
      {
        runId: run.runToken,
        sealed: projection.sealed,
        auditScopeUnits: projection.auditScopeUnits.filter((unit) => subjectInNode(unit.subject, nodeId)),
        ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
        ...(projection.verifier === undefined ? {} : { verifier: projection.verifier }),
      },
      { malleability: NODE_STATUS_MALLEABILITY.IMPLEMENTATION, linkedEvidenceKinds },
    );
    if (entry === undefined || entry.section !== AUDIT_CLAIM_ENTRY_SECTION.EVIDENCE || entry.key in results) continue;
    const read = runJudgedPathsOf(run.events);
    if (!(await unchangedSince(pinChanges, run.headCommit, read))) continue;
    results[entry.key] = { verdict: entry.verdict, read, actor: entry.actor, run: entry.run };
  }
  return results;
}
