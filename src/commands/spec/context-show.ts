import { posix } from "node:path";

import { requireMethodologyVersion } from "@/config/methodology";
import {
  checkProviderMatch,
  containedTreeResourcePath,
  defaultMethodologyTreeFileSystem,
  formatFoundationResourceUnreadableError,
  type MethodologyTreeFileSystem,
  resolveFoundationManifest,
  resolveMethodologyTree,
} from "@/lib/methodology";
import {
  compareSpecContextOrdinal,
  projectSpecContextDocument,
  selectSpecContextDocuments,
  SPEC_CONTEXT_MODE,
  specContextCitedSelection,
  type SpecContextEntry,
  specContextInlineDecisionCitations,
  type SpecContextProjectedEntry,
  type SpecContextSelection,
  type SpecContextTarget,
  type SpecContextTargetFailure,
  splitSpecContextFrontMatter,
  suppressLoadedSpecContext,
} from "@/lib/spec-tree";
import { type ContextInput, type ContextInputOptions, readContextInput, resolveContextTargets } from "./context-input";

export interface ContextShowOptions extends ContextInputOptions {
  readonly targets: readonly string[];
  readonly loadedTargets?: readonly string[];
  readonly loadedProduct?: boolean;
  readonly loadedMethodology?: boolean;
  readonly methodology?: boolean;
  readonly codingAgent?: string;
  readonly methodologyTreeRoot?: string;
  readonly methodologyFileSystem?: MethodologyTreeFileSystem;
}

export type ContextShowResult =
  | { readonly ok: true; readonly entries: readonly SpecContextEntry[] }
  | { readonly ok: false; readonly failure: SpecContextTargetFailure };

async function readProjectedDocument(
  input: ContextInput,
  selection: SpecContextSelection,
): Promise<SpecContextEntry> {
  const source = selection.mode === SPEC_CONTEXT_MODE.REFERENCE && selection.referenceTitle !== true
    ? ""
    : await input.readDocument(selection.path);
  return projectSpecContextDocument(selection, source, input.methodology.migratingFrom !== undefined);
}

async function projectContext(
  input: ContextInput,
  targets: readonly SpecContextTarget[],
): Promise<readonly SpecContextProjectedEntry[]> {
  const structural = await existingSelections(input, targets);
  const structuralPaths = new Set(structural.map(({ path }) => path));
  const decisions = new Set(input.snapshot.decisions.flatMap(({ ref }) => ref?.path ?? []));
  const projected = new Map<string, SpecContextProjectedEntry>();
  const pending = [...structural];
  for (let index = 0; index < pending.length; index += 1) {
    const selection = pending[index];
    const previous = projected.get(selection.path);
    if (previous !== undefined && previous.selection.mode >= selection.mode) continue;
    const entry = await readProjectedDocument(input, selection);
    projected.set(selection.path, { selection, entry });
    if (entry.type !== "document" || selection.scanCitations !== true) continue;
    for (const path of specContextInlineDecisionCitations(entry.content)) {
      if (!decisions.has(path) || !input.existingPaths.has(path)) {
        throw new Error(`Missing cited decision ${path} in ${selection.path}`);
      }
      pending.push(specContextCitedSelection(path));
    }
  }
  const additional = [...projected.values()].filter(({ selection }) => !structuralPaths.has(selection.path))
    .sort((left, right) => compareSpecContextOrdinal(left.selection.path, right.selection.path));
  return [
    ...structural.map(({ path }) => {
      const document = projected.get(path);
      if (document === undefined) throw new Error(`Unresolved context document: ${path}`);
      return document;
    }),
    ...additional,
  ];
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

async function methodologyDocument(input: ContextInput, options: ContextShowOptions): Promise<SpecContextEntry> {
  if (options.methodologyTreeRoot === undefined) {
    throw new Error("No shipped methodology tree root is available to this invocation");
  }
  const version = requireMethodologyVersion(input.methodology);
  if (!version.ok) throw new Error(version.error);
  const fs = options.methodologyFileSystem ?? defaultMethodologyTreeFileSystem;
  const tree = await resolveMethodologyTree({
    treeRoot: options.methodologyTreeRoot,
    version: version.value,
    codingAgent: options.codingAgent,
    fs,
  });
  if (!tree.ok) throw new Error(tree.error);
  const match = checkProviderMatch({
    version: version.value,
    migratingFrom: input.methodology.migratingFrom,
    sourceRecord: tree.value.sourceRecord,
    codingAgent: tree.value.codingAgent,
  });
  if (!match.ok) throw new Error(match.error);
  const resolved = await resolveFoundationManifest(tree.value.treeDir, fs);
  if (!resolved.ok) throw new Error(resolved.error);
  const { manifest, manifestPath, treeDir } = resolved.value;
  const corePath = await containedTreeResourcePath(treeDir, manifest.core, fs);
  if (corePath === undefined) throw new Error(formatFoundationResourceUnreadableError(manifest.core, manifestPath));
  let source: string;
  try {
    source = await fs.readFile(corePath);
  } catch {
    throw new Error(formatFoundationResourceUnreadableError(manifest.core, manifestPath));
  }
  const path = posix.join(tree.value.relativeDir, manifest.core);
  return { type: "document", path, metadata: {}, content: splitSpecContextFrontMatter(source, path).body };
}

export async function resolveContextShow(options: ContextShowOptions): Promise<ContextShowResult> {
  if (options.methodology === true && options.loadedMethodology === true) {
    throw new Error("--methodology and --loaded-methodology are mutually exclusive");
  }
  const input = await readContextInput(options);
  const requested = await resolveContextTargets(input, options.targets);
  if (!requested.ok) return requested;
  const loaded = await resolveContextTargets(input, options.loadedTargets ?? []);
  if (!loaded.ok) return loaded;
  const projection = await projectContext(input, requested.targets);
  const prior: SpecContextProjectedEntry[] = [];
  if (options.loadedProduct === true) prior.push(...await projectContext(input, []));
  for (const target of loaded.targets) prior.push(...await projectContext(input, [target]));
  const entries = suppressLoadedSpecContext(projection, prior);
  return {
    ok: true,
    entries: options.methodology === true ? [await methodologyDocument(input, options), ...entries] : entries,
  };
}
