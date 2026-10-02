import {
  compareSpecContextOrdinal,
  projectSpecContextDocument,
  selectSpecContextDocuments,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_MODE,
  specContextBoundCitations,
  specContextCitedSelection,
  type SpecContextEntry,
  type SpecContextProjectedEntry,
  type SpecContextSelection,
  type SpecContextTarget,
} from "@/lib/spec-tree";
import type { ContextInput } from "./context-input";

/**
 * The complete selection one target set resolves to: the structural walk in
 * walk order, every cited decision outside it in canonical path order, and
 * the documents whose displayed content cites each decision. `list` and
 * `show` both read their selected documents and cited decisions from here, so
 * the two commands cannot select differently.
 */
export interface SpecContextClosure {
  readonly entries: readonly SpecContextEntry[];
  readonly cited: readonly SpecContextClosureCitation[];
}

/** One cited decision outside the structural walk, with every document whose displayed content cites it. */
export interface SpecContextClosureCitation {
  readonly path: string;
  readonly citedBy: readonly string[];
}

async function readProjectedDocument(
  input: ContextInput,
  selection: SpecContextSelection,
): Promise<{ readonly ok: true; readonly entry: SpecContextEntry } | { readonly ok: false; readonly error: unknown }> {
  const source = selection.mode === SPEC_CONTEXT_MODE.REFERENCE ? "" : await input.readDocument(selection.path);
  try {
    return {
      ok: true,
      entry: projectSpecContextDocument(selection, source, input.methodology.migratingFrom !== undefined),
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
 * its displayed content carries — Full bodies for Full documents, opening
 * paragraphs for Digest documents — transitively, until no unread cited
 * decision remains. Any document failure, and any citation that binds no
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
    const { entry } = result;
    digestFailures.delete(selection.path);
    projected.set(selection.path, { selection, entry });
    if (entry.type !== SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT || selection.scanCitations !== true) continue;
    for (
      const path of specContextBoundCitations(entry.content, selection.path, decisions, input.existingPaths)
    ) {
      if (!structuralPaths.has(path)) {
        const citing = citedBy.get(path) ?? new Set<string>();
        citing.add(selection.path);
        citedBy.set(path, citing);
      }
      pending.push(specContextCitedSelection(path));
    }
  }
  const firstFailure = digestFailures.values().next();
  if (firstFailure.done !== true) throw firstFailure.value;
  const cited = [...citedBy].sort(([left], [right]) => compareSpecContextOrdinal(left, right))
    .map(([path, citing]) => ({ path, citedBy: [...citing].sort(compareSpecContextOrdinal) }));
  const projectedEntry = (path: string): SpecContextEntry => {
    const document = projected.get(path);
    if (document === undefined) throw new Error(`Unresolved context document: ${path}`);
    return document.entry;
  };
  return {
    entries: [
      ...structural.map(({ path }) => projectedEntry(path)),
      ...cited.map(({ path }) => projectedEntry(path)),
    ],
    cited,
  };
}
