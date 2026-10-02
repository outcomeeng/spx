import { resolveMethodologyIdentity } from "@/config/methodology";
import {
  composeSpecContextManifestSelection,
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
  TARGETS: "Targets",
  PRODUCT_ROOT: "Product root",
  METHODOLOGY: "Methodology",
  SCHEMA_VERSION: "Schema version",
  BOOTSTRAP: "Bootstrap",
  ENTRIES: "Entries",
  MIGRATING_FROM: "migrating from",
  CITED_BY: "cited by",
} as const;

/**
 * The manifest of a target set: every entry the shared closure selects for
 * `show`, in `show` order, with the target-role pairs through which the
 * selection reaches it.
 */
export async function resolveContextManifest(options: ContextOptions): Promise<SpecContextManifestResolution> {
  const input = await readContextInput(options);
  const resolved = await resolveContextTargets(input, options.targets);
  if (!resolved.ok) return resolved;
  const closure = await resolveSpecContextClosure(input, resolved.targets);
  const selection = composeSpecContextManifestSelection(
    resolved.targets.map(({ path }) => path),
    closure.entries.map(({ entry, roles, citedBy }) => ({
      path: entry.path,
      roles,
      ...(citedBy === undefined ? {} : { citedBy }),
    })),
  );
  return {
    ok: true,
    manifest: {
      schemaVersion: SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
      methodology: resolveMethodologyIdentity(input.methodology),
      productDir: input.productDir,
      bootstrap: specContextBootstrap(input.snapshot.allNodes.length),
      ...selection,
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
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.TARGETS)}: ${externalValue(manifest.targets.join(", "))}`,
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT)}: ${externalValue(manifest.productDir)}`,
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY)}: ${externalValue(methodology + migration)}`,
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION)}: ${externalValue(String(manifest.schemaVersion))}`,
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP)}: ${externalValue(String(manifest.bootstrap))}`,
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.ENTRIES)}:`,
    ...manifest.entries.map((entry) =>
      terminal`  - ${externalValue(entry.roles.map(({ role, target }) => `${role}@${target}`).join(", "))}: ${
        externalValue(entry.path)
      }${
        entry.citedBy === undefined
          ? authoredText("")
          : terminal` (${authoredText(SPEC_CONTEXT_TEXT_LABEL.CITED_BY)} ${externalValue(entry.citedBy.join(", "))})`
      }`
    ),
  ];
  return joinTerminalText(authoredText("\n"), lines);
}

/** Indentation of every `spx spec context` JSON document, manifest and entry stream alike. */
export const JSON_INDENTATION = 2;

export function renderSpecContextJson(manifest: SpecContextManifest): TerminalText {
  return jsonDocument(manifest, JSON_INDENTATION);
}

/** The manifest a `list --json` document carries, read back from its text. */
export function parseSpecContextManifestJson(text: string): SpecContextManifest {
  return JSON.parse(text) as SpecContextManifest;
}
