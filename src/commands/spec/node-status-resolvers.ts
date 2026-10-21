import { isAbsolute, relative, sep } from "node:path";

import { listJournalRuns, readJournalEvents } from "@/commands/journal/runtime";
import { JOURNAL_RUN_SEALED_FILTER } from "@/domains/journal/run-scope";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { buildEvidenceResults, foldEvidenceVerdict } from "@/domains/test";
import {
  AUDIT_CLAIM_ENTRY_SECTION,
  auditClaimEntries,
  CLAIM_EVIDENCE_KIND,
  type ClaimEvidenceKind,
} from "@/domains/verify/audit-claim-entry";
import {
  headCommitOf,
  projectVerifyRun,
  runJudgedPathsOf,
  validateTestFinding,
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
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_MALLEABILITY,
  type NodeAttributedRequest,
  type NodeAttributedResult,
  type NodeAttributedResultResolver,
  type NodeAttributedResults,
  type NodeOutcomeResolver,
  type NodeReadPathResolver,
  type NodeStatusEvidenceOutcome,
  type PinChangeReader,
  readNodeSpecDeclaration,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { resolveVerificationBranchSlug, type StateStoreFileSystem } from "@/lib/state-store";
import { SPX_VERIFY_ENV } from "@/lib/verification-env";
import { type TestingLanguageDescriptor } from "@/test/languages/types";
import { TEST_PATH_VERDICT, type TestPathVerdictValue } from "@/test/run-state";

import { createNodeOutcomeResolver, type NodeOutcomeResolverDependencies } from "./node-outcome-resolver";

const PATH_SEPARATOR = "/";

/** Dependencies the production status resolvers compose over the testing domain and the verification journals. */
export interface NodeStatusResolverDependencies extends NodeOutcomeResolverDependencies {
  /** Git runner for the journals' product root and for freshness against a run's head commit. */
  readonly git?: GitDependencies;
  readonly journalFs?: StateStoreFileSystem;
  /** Environment the verification runs were recorded under; its branch override scopes the sealed runs read. */
  readonly processEnv?: NodeJS.ProcessEnv;
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
  /** The terminal status the run sealed with. */
  readonly terminalStatus: string | undefined;
  /** The modules a recorded finding names. */
  readonly failedModules: ReadonlySet<string>;
}

/** A module's verdict and read paths, both taken from the one sealed run that covered it. */
interface JournaledModule {
  readonly moduleId: string;
  readonly verdict: TestPathVerdictValue;
  readonly readPaths: readonly string[];
  readonly headCommit: string | undefined;
}

function isJsonRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builds the resolvers `--update` injects. For a language whose adapter supplies read paths, a covered
 * reference's verdict and the paths it read both come from the newest sealed `test` run journal that covers
 * it, so a verdict never takes the read paths of another run; every other reference takes its outcome from
 * recorded last-run evidence, which carries no read paths. `evidence` results come from sealed `audit` run
 * journals. Every journal read is memoized for the pass, a journal that records no head commit supplies no
 * evidence, a run whose judged paths changed since its head commit is stale, and no resolver executes
 * verification.
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
  let journaledModules: Promise<readonly JournaledModule[]> | undefined;
  const modules = (): Promise<
    readonly JournaledModule[]
  > => (journaledModules ??= sealedRuns(VERIFY_VERIFICATION_TYPE.TEST).then(newestJournaledModules));
  const moduleOf = async (evidencePath: string): Promise<JournaledModule | undefined> =>
    (await modules()).find((candidate) => moduleCovers(deps.productDir, candidate.moduleId, evidencePath));
  const lastRunOutcomes = createNodeOutcomeResolver(deps);
  const journals = (evidencePath: string): boolean =>
    owningLanguages(deps, evidencePath).some((language) => language.suppliesReadPaths);

  const resolveOutcome: NodeOutcomeResolver = async (nodeId, evidencePaths) => {
    const journaled = evidencePaths.filter(journals);
    const lastRunPaths = evidencePaths.filter((path) => !journals(path));
    const outcomes: Record<string, NodeStatusEvidenceOutcome> = lastRunPaths.length === 0
      ? {}
      : { ...await lastRunOutcomes(nodeId, lastRunPaths) };
    if (journaled.length === 0) return outcomes;
    const { specPath } = await readNodeSpecDeclaration(deps.productDir, nodeId);
    for (const evidencePath of journaled) {
      const module = await moduleOf(evidencePath);
      // A path no journal covers, or a journal that records no head commit, supplies no evidence.
      if (module?.headCommit === undefined) {
        outcomes[evidencePath] = NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN;
        continue;
      }
      // Stale evidence stays unresolved, so the committed entry stands until a run replaces it.
      const read = [specPath, evidencePath, ...module.readPaths];
      if (!await unchangedSince(pinChanges, module.headCommit, read)) continue;
      outcomes[evidencePath] = journalEvidence(deps, evidencePath, module).verdict;
    }
    return outcomes;
  };

  return {
    resolveOutcome,
    resolveReadPaths: async (_nodeId, evidencePath) => {
      const module = await moduleOf(evidencePath);
      if (module === undefined) return undefined;
      if (!await unchangedSince(pinChanges, module.headCommit, module.readPaths)) return undefined;
      return journalEvidence(deps, evidencePath, module).readPaths;
    },
    resolveAttributedResults: async (nodeId, request) => ({
      evidence: await evidenceResults(await sealedRuns(VERIFY_VERIFICATION_TYPE.AUDIT), pinChanges, nodeId, request),
    }),
  };
}

/** The languages whose test-file patterns own the evidence path. */
function owningLanguages(
  deps: NodeStatusResolverDependencies,
  evidencePath: string,
): readonly TestingLanguageDescriptor[] {
  return deps.registry.languages.filter((language) => language.matchesTestFile(evidencePath));
}

/**
 * The evidence contract's result for one journaled module: its verdict and, for a language whose adapter
 * supplies them, the paths it read. Both fields come from the one module entry, so they describe one run.
 */
function journalEvidence(
  deps: NodeStatusResolverDependencies,
  evidencePath: string,
  module: JournaledModule,
): { readonly verdict: TestPathVerdictValue; readonly readPaths: readonly string[] | undefined } {
  const results = buildEvidenceResults(
    owningLanguages(deps, evidencePath).map((language) => ({
      runnerId: language.name,
      pathVerdicts: [{ testPath: evidencePath, verdict: module.verdict }],
    })),
    deps.registry.languages,
    new Map([[evidencePath, module.readPaths]]),
  );
  return {
    verdict: foldEvidenceVerdict(results),
    readPaths: results.find((result) => result.readPaths !== undefined)?.readPaths,
  };
}

/**
 * Whether a journaled module identity names the product-relative evidence path: the module's path relative to
 * the checkout the tests ran in is the evidence path itself, so a path that merely shares a trailing segment
 * sequence with the evidence path names another module.
 */
function moduleCovers(productDir: string, moduleId: string, evidencePath: string): boolean {
  const identity = isAbsolute(moduleId) ? relative(productDir, moduleId).split(sep).join(PATH_SEPARATOR) : moduleId;
  return identity === evidencePath;
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

/** Every sealed run of the type in the current branch's scope of the Git common-dir store, newest first. */
async function readSealedRuns(
  deps: NodeStatusResolverDependencies,
  git: GitDependencies,
  type: VerifyVerificationType,
): Promise<readonly SealedRun[]> {
  const options = deps.journalFs === undefined ? {} : { fs: deps.journalFs };
  const { productDir, isGitRepo } = await detectGitCommonDirProductRoot(deps.productDir, git);
  const branchSlug = await resolveVerificationBranchSlug({
    cwd: deps.productDir,
    isGitRepo,
    git,
    branchOverride: (deps.processEnv ?? process.env)[SPX_VERIFY_ENV.BRANCH],
  });
  const listed = await listJournalRuns(
    { productDir, branchSlug, type, sealed: JOURNAL_RUN_SEALED_FILTER.SEALED, limit: Number.POSITIVE_INFINITY },
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
    if (events.ok) {
      runs.push({
        runToken: run.runToken,
        events: events.value,
        headCommit: headCommitOf(events.value),
        terminalStatus: projectVerifyRun(events.value).terminalStatus,
        failedModules: failedModulesOf(events.value),
      });
    }
  }
  return runs;
}

/**
 * The verdict a sealed run's journal supplies for a module it records a scope event for: `failed` when a
 * finding names the module; otherwise `passed` only when the run sealed `passed`, which means every module
 * whose scope the journal records ran; otherwise `not-run`, because a run that did not pass cannot tell a
 * module that failed to load from one that passed.
 */
function journalVerdict(run: SealedRun, moduleId: string): TestPathVerdictValue {
  if (run.failedModules.has(moduleId)) return TEST_PATH_VERDICT.FAILED;
  return run.terminalStatus === JOURNAL_RUN_STATE_STATUS.PASSED ? TEST_PATH_VERDICT.PASSED : TEST_PATH_VERDICT.NOT_RUN;
}

/** The modules of the sealed runs, each taken whole from the newest run that covered it. */
function newestJournaledModules(runs: readonly SealedRun[]): readonly JournaledModule[] {
  const newest = new Map<string, JournaledModule>();
  for (const run of runs) {
    for (const event of run.events) {
      if (event.type !== VERIFY_APPEND_EVENT_TYPE.SCOPE || !isJsonRecord(event.data)) continue;
      const scope = validateTestScope(event.data[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]);
      if (!scope.ok || newest.has(scope.value.moduleId)) continue;
      newest.set(scope.value.moduleId, {
        moduleId: scope.value.moduleId,
        verdict: journalVerdict(run, scope.value.moduleId),
        readPaths: scope.value.readPaths ?? [],
        headCommit: run.headCommit,
      });
    }
  }
  return [...newest.values()];
}

/** The modules the run's recorded `test` findings name. */
function failedModulesOf(events: readonly JournalEvent[]): ReadonlySet<string> {
  const failed = new Set<string>();
  for (const event of events) {
    if (event.type !== VERIFY_APPEND_EVENT_TYPE.FINDING || !isJsonRecord(event.data)) continue;
    const finding = validateTestFinding(event.data[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]);
    if (finding.ok) failed.add(finding.value.moduleId);
  }
  return failed;
}

const LINKED_EVIDENCE_KINDS: ReadonlySet<string> = new Set(Object.values(CLAIM_EVIDENCE_KIND));

/** Whether a unit's subject lies in the node's directory. */
function subjectInNode(subject: string, nodeId: string): boolean {
  const nodePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}${nodeId}`;
  return subject === nodePath || subject.startsWith(`${nodePath}${PATH_SEPARATOR}`);
}

/** The `evidence` results the node's requested kinds take from the newest sealed audit run that yields each. */
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
    const entries = auditClaimEntries(
      {
        runId: run.runToken,
        sealed: projection.sealed,
        auditScopeUnits: projection.auditScopeUnits.filter((unit) => subjectInNode(unit.subject, nodeId)),
        ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
        ...(projection.verifier === undefined ? {} : { verifier: projection.verifier }),
      },
      { malleability: NODE_STATUS_MALLEABILITY.IMPLEMENTATION, linkedEvidenceKinds },
    ).filter((entry) => entry.section === AUDIT_CLAIM_ENTRY_SECTION.EVIDENCE && !(entry.key in results));
    if (entries.length === 0) continue;
    const read = runJudgedPathsOf(run.events);
    if (!(await unchangedSince(pinChanges, run.headCommit, read))) continue;
    for (const entry of entries) {
      results[entry.key] = { verdict: entry.verdict, read, actor: entry.actor, run: entry.run };
    }
  }
  return results;
}
