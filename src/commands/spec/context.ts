import { resolveMethodologyIdentity } from "@/config/methodology";
import {
  composeSpecContextManifestEntries,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  specContextBootstrap,
  type SpecContextManifest,
  type SpecContextTargetFailure,
} from "@/lib/spec-tree";
import {
  authoredText,
  externalValue,
  joinTerminalText,
  jsonDocument,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import { resolveSpecContextClosure } from "./context-closure";
import { type ContextInputOptions, readContextInput, resolveContextTargets } from "./context-input";

export interface ContextOptions extends ContextInputOptions {
  readonly targets: readonly string[];
}

export type SpecContextManifestResolution =
  | { readonly ok: true; readonly manifest: SpecContextManifest }
  | { readonly ok: false; readonly failure: SpecContextTargetFailure };

export const SPEC_CONTEXT_TEXT_LABEL = {
  SCHEMA_VERSION: "Schema version",
  BOOTSTRAP: "Bootstrap",
  METHODOLOGY: "Methodology",
  MIGRATING_FROM: "migrating from",
  CITED_BY: "cited by",
} as const;

/** The indentation of each selection line beneath its entry line in text `list` output. */
export const SPEC_CONTEXT_TEXT_SELECTION_INDENT = "  ";

/**
 * The layout that continues a text `list` entry line after its path when the
 * entry carries `citedBy`: the opener, the `cited by` label, the separator
 * between label and paths, the separator between consecutive paths, and the closer.
 */
export const SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT = {
  OPEN: " (",
  LABEL_SEPARATOR: " ",
  PATH_SEPARATOR: ", ",
  CLOSE: ")",
} as const;

/**
 * The manifest of a target set: every entry the shared closure selects for
 * `show`, in `show` order, with its composed mode and one selection per
 * requested target that selects it.
 */
export async function resolveContextManifest(options: ContextOptions): Promise<SpecContextManifestResolution> {
  const input = await readContextInput(options);
  const resolved = await resolveContextTargets(input, options.targets);
  if (!resolved.ok) return resolved;
  const closure = await resolveSpecContextClosure(input, resolved.targets);
  const productSpec = input.snapshot.product?.ref?.path;
  return {
    ok: true,
    manifest: {
      schemaVersion: SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
      bootstrap: specContextBootstrap(
        productSpec !== undefined && input.existingPaths.has(productSpec),
        input.snapshot.allNodes.length,
      ),
      methodology: resolveMethodologyIdentity(input.methodology),
      entries: composeSpecContextManifestEntries(
        closure.entries.map(({ entry, reasons, citedBy }) => ({
          path: entry.path,
          reasons,
          ...(citedBy === undefined ? {} : { citedBy }),
        })),
      ),
    },
  };
}

export function renderSpecContextText(manifest: SpecContextManifest): TerminalText {
  const identity = manifest.methodology;
  const methodology = identity.version === undefined ? identity.source : `${identity.source}@${identity.version}`;
  const migration = identity.migratingFrom === undefined
    ? ""
    : ` (${SPEC_CONTEXT_TEXT_LABEL.MIGRATING_FROM} ${identity.migratingFrom})`;
  const lines = [
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION)}: ${externalValue(String(manifest.schemaVersion))}`,
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP)}: ${externalValue(String(manifest.bootstrap))}`,
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY)}: ${externalValue(methodology + migration)}`,
    ...manifest.entries.flatMap((entry) => [
      terminal`${authoredText(entry.mode)} ${externalValue(entry.path)}${
        entry.citedBy === undefined
          ? authoredText("")
          : terminal`${authoredText(SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT.OPEN)}${
            authoredText(SPEC_CONTEXT_TEXT_LABEL.CITED_BY)
          }${authoredText(SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT.LABEL_SEPARATOR)}${
            externalValue(entry.citedBy.join(SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT.PATH_SEPARATOR))
          }${authoredText(SPEC_CONTEXT_TEXT_CITED_BY_LAYOUT.CLOSE)}`
      }`,
      ...entry.selections.map(({ reason, target }) =>
        terminal`${authoredText(SPEC_CONTEXT_TEXT_SELECTION_INDENT)}${authoredText(reason)} ${externalValue(target)}`
      ),
    ]),
  ];
  return joinTerminalText(authoredText("\n"), lines);
}

/** Indentation of every `spx spec context` JSON document, manifest and entry stream alike. */
export const JSON_INDENTATION = 2;

export function renderSpecContextJson(manifest: SpecContextManifest): TerminalText {
  return jsonDocument(manifest, JSON_INDENTATION);
}
