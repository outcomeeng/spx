import {
  compareSpecContextOrdinal,
  projectSpecContextDocument,
  selectSpecContextDocuments,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_MODE,
  SPEC_CONTEXT_ROLE,
  specContextBoundCitations,
  specContextCitedSelection,
  type SpecContextEntry,
  type SpecContextProjectedEntry,
  type SpecContextRoleBinding,
  type SpecContextSelection,
  type SpecContextTarget,
} from "@/lib/spec-tree";
import type { ContextInput } from "./context-input";

/**
 * The complete selection one target set resolves to: the structural walk in
 * walk order, then every cited decision outside it in canonical path order.
 * `list` and `show` both read their entries from here, so the two commands
 * cannot select differently.
 */
export interface SpecContextClosure {
  readonly entries: readonly SpecContextClosureEntry[];
}

/**
 * One selected entry with every target-role pair through which the selection
 * reaches it; a cited decision outside the structural walk also carries every
 * selected document whose complete source cites it, in the order the closure
 * lists those documents.
 */
export interface SpecContextClosureEntry {
  readonly entry: SpecContextEntry;
  readonly roles: readonly SpecContextRoleBinding[];
  readonly citedBy?: readonly string[];
}

/** Adds to `path` every target bound by any of its citers; whether any target was added. */
function addCitingTargets(
  path: string,
  citers: ReadonlySet<string>,
  targetsByPath: Map<string, Set<string>>,
): boolean {
  const targets = targetsByPath.get(path) ?? new Set<string>();
  targetsByPath.set(path, targets);
  const before = targets.size;
  for (const citer of citers) {
    for (const target of targetsByPath.get(citer) ?? []) targets.add(target);
  }
  return targets.size > before;
}

/**
 * The cited-decision bindings of every cited decision: a decision is cited for
 * each target that binds any document citing it, followed transitively through
 * cited decisions until no binding is added.
 */
function citedDecisionRoles(
  structural: readonly SpecContextSelection[],
  citedBy: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<string, readonly SpecContextRoleBinding[]> {
  const targetsByPath = new Map<string, Set<string>>();
  for (const { path, roles } of structural) {
    const targets = targetsByPath.get(path) ?? new Set<string>();
    for (const { target } of roles) targets.add(target);
    targetsByPath.set(path, targets);
  }
  for (const path of citedBy.keys()) targetsByPath.set(path, new Set<string>());
  let changed = true;
  while (changed) {
    changed = false;
    for (const [path, citers] of citedBy) {
      if (addCitingTargets(path, citers, targetsByPath)) changed = true;
    }
  }
  return new Map(
    [...citedBy.keys()].map((path) => [
      path,
      [...(targetsByPath.get(path) ?? [])].map((target) => ({ target, role: SPEC_CONTEXT_ROLE.CITED_DECISION })),
    ]),
  );
}

type ProjectedDocumentResult =
  | { readonly ok: true; readonly entry: SpecContextEntry; readonly source: string }
  | { readonly ok: false; readonly error: unknown };

/** The projected entry together with the complete source it was projected from. */
async function readProjectedDocument(
  input: ContextInput,
  selection: SpecContextSelection,
): Promise<ProjectedDocumentResult> {
  const source = selection.mode === SPEC_CONTEXT_MODE.REFERENCE ? "" : await input.readDocument(selection.path);
  try {
    return {
      ok: true,
      entry: projectSpecContextDocument(selection, source),
      source,
    };
  } catch (error) {
    if (selection.mode !== SPEC_CONTEXT_MODE.DIGEST) throw error;
    // A later citation can upgrade this document to Full, which needs no opening.
    return { ok: false, error };
  }
}

async function existingSelections(
  input: ContextInput,
  targets: readonly SpecContextTarget[],
): Promise<readonly SpecContextSelection[]> {
  const result: SpecContextSelection[] = [];
  for (const selection of selectSpecContextDocuments(input.snapshot, targets, input.existingPaths)) {
    if (selection.optional !== true || await input.hasDocument(selection.path)) result.push(selection);
  }
  return result;
}

/**
 * Projects the structural selection of `targets` and follows the citations
 * the complete source of each selected document carries — whatever its
 * projection mode displays — transitively, until no unread cited decision
 * remains. Any document failure, and any citation that binds no
 * tracked decision, fails the whole closure.
 */
export async function resolveSpecContextClosure(
  input: ContextInput,
  targets: readonly SpecContextTarget[],
): Promise<SpecContextClosure> {
  const structural = await existingSelections(input, targets);
  const structuralPaths = new Set(structural.map(({ path }) => path));
  const decisions = new Set(input.snapshot.decisions.flatMap(({ ref }) => ref?.path ?? []));
  const projected = new Map<string, SpecContextProjectedEntry>();
  const citedBy = new Map<string, Set<string>>();
  const digestFailures = new Map<string, unknown>();
  const pending = [...structural];
  for (let index = 0; index < pending.length; index += 1) {
    const selection = pending[index];
    const previous = projected.get(selection.path);
    if (previous !== undefined && previous.selection.mode >= selection.mode) continue;
    const result = await readProjectedDocument(input, selection);
    if (!result.ok) {
      digestFailures.set(selection.path, result.error);
      continue;
    }
    const { entry, source } = result;
    digestFailures.delete(selection.path);
    projected.set(selection.path, { selection, entry });
    if (entry.type !== SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT || selection.scanCitations !== true) continue;
    for (
      const path of specContextBoundCitations(source, selection.path, decisions, input.existingPaths)
    ) {
      if (!structuralPaths.has(path)) {
        const citing = citedBy.get(path) ?? new Set<string>();
        citing.add(selection.path);
        citedBy.set(path, citing);
      }
      pending.push(specContextCitedSelection(path, []));
    }
  }
  const firstFailure = digestFailures.values().next();
  if (firstFailure.done !== true) throw firstFailure.value;
  const citedRoles = citedDecisionRoles(structural, citedBy);
  const projectedEntry = (path: string): SpecContextEntry => {
    const document = projected.get(path);
    if (document === undefined) throw new Error(`Unresolved context document: ${path}`);
    return document.entry;
  };
  const cited = [...citedBy.keys()].sort(compareSpecContextOrdinal);
  const position = new Map([...structural.map(({ path }) => path), ...cited].map((path, index) => [path, index]));
  const closurePosition = (path: string): number => {
    const index = position.get(path);
    if (index === undefined) throw new Error(`Citing document outside the context closure: ${path}`);
    return index;
  };
  return {
    entries: [
      ...structural.map(({ path, roles }) => ({ entry: projectedEntry(path), roles })),
      ...cited.map((path) => ({
        entry: projectedEntry(path),
        roles: citedRoles.get(path) ?? [],
        citedBy: [...(citedBy.get(path) ?? [])].sort((left, right) => closurePosition(left) - closurePosition(right)),
      })),
    ],
  };
}
