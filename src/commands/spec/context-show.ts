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
  SPEC_CONTEXT_ENTRY_TYPE,
  type SpecContextEntry,
  type SpecContextTargetFailure,
  splitSpecContextFrontMatter,
} from "@/lib/spec-tree";
import { jsonDocument, type TerminalText } from "@/lib/terminal-text/terminal-text";
import { JSON_INDENTATION } from "./context";
import { resolveSpecContextClosure } from "./context-closure";
import { type ContextInput, type ContextInputOptions, readContextInput, resolveContextTargets } from "./context-input";

/** The one key of the `show --json` document, carrying the ordered entry stream. */
export const SPEC_CONTEXT_ENTRIES_KEY = "entries";

/** The `show --json` document: the same ordered entries the text stream frames. */
export interface SpecContextEntriesDocument {
  readonly [SPEC_CONTEXT_ENTRIES_KEY]: readonly SpecContextEntry[];
}

/** The JSON representation of the entry stream. */
export function renderSpecContextEntriesJson(entries: readonly SpecContextEntry[]): TerminalText {
  const document: SpecContextEntriesDocument = { [SPEC_CONTEXT_ENTRIES_KEY]: entries };
  return jsonDocument(document, JSON_INDENTATION);
}

export interface ContextShowOptions extends ContextInputOptions {
  readonly targets: readonly string[];
  readonly methodology?: boolean;
  readonly codingAgent?: string;
  readonly methodologyTreeRoot?: string;
  readonly methodologyFileSystem?: MethodologyTreeFileSystem;
}

export type ContextShowResult =
  | { readonly ok: true; readonly entries: readonly SpecContextEntry[] }
  | { readonly ok: false; readonly failure: SpecContextTargetFailure };

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
  return {
    type: SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT,
    path,
    metadata: {},
    content: splitSpecContextFrontMatter(source, path).body,
  };
}

export async function resolveContextShow(options: ContextShowOptions): Promise<ContextShowResult> {
  const input = await readContextInput(options);
  const requested = await resolveContextTargets(input, options.targets);
  if (!requested.ok) return requested;
  const closure = await resolveSpecContextClosure(input, requested.targets);
  const entries = closure.entries.map(({ entry }) => entry);
  return {
    ok: true,
    entries: options.methodology === true ? [await methodologyDocument(input, options), ...entries] : entries,
  };
}
