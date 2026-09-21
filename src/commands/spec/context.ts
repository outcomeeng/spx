import { resolveMethodologyIdentity } from "@/config/methodology";
import {
  assembleSpecContextTargetReadSet,
  compareSpecContextOrdinal,
  composeSpecContextBundle,
  isLocalOverlayPath,
  SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_READ_ROLE,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  specContextAncestors,
  specContextBootstrap,
  specContextBoundCitations,
  specContextDecisions,
  specContextEvidence,
  specContextLowerIndexSiblings,
  type SpecContextManifest,
  specContextSiblings,
  type SpecContextTarget,
  type SpecContextTargetFailure,
  type SpecContextTargetReadDocument,
  type SpecContextTargetReadSet,
} from "@/lib/spec-tree";
import {
  authoredText,
  externalValue,
  joinTerminalText,
  jsonDocument,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import { type ContextInput, type ContextInputOptions, readContextInput, resolveContextTargets } from "./context-input";

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
  READ: "Read",
  LISTED: "Listed",
  MIGRATING_FROM: "migrating from",
} as const;

async function manifestCitations(
  input: ContextInput,
  structural: readonly string[],
): Promise<readonly SpecContextTargetReadDocument[]> {
  const selected = new Set(structural);
  const decisionsByPath = new Set(input.snapshot.decisions.flatMap(({ ref }) => ref?.path ?? []));
  const cited = new Map<string, Set<string>>();
  const pending = [...structural];
  for (let index = 0; index < pending.length; index += 1) {
    const citing = pending[index];
    for (
      const path of specContextBoundCitations(
        await input.readDocument(citing),
        citing,
        decisionsByPath,
        input.existingPaths,
      )
    ) {
      if (!selected.has(path)) {
        selected.add(path);
        pending.push(path);
      }
      if (!structural.includes(path)) {
        const provenance = cited.get(path) ?? new Set<string>();
        provenance.add(citing);
        cited.set(path, provenance);
      }
    }
  }
  return [...cited].sort(([left], [right]) => compareSpecContextOrdinal(left, right))
    .map(([path, citedBy]) => ({
      path,
      role: SPEC_CONTEXT_READ_ROLE.CITED_DECISION,
      citedBy: [...citedBy].sort(compareSpecContextOrdinal),
    }));
}

async function targetReadSet(input: ContextInput, target: SpecContextTarget): Promise<SpecContextTargetReadSet> {
  const node = target.node;
  const ancestors = node === undefined ? [] : specContextAncestors(input.snapshot, node);
  const contextNodes = node === undefined ? [] : [...ancestors, node];
  const siblings = node === undefined ? [] : specContextSiblings(input.snapshot, node);
  const exists = (paths: readonly (string | undefined)[]): string[] =>
    paths.filter((path): path is string => path !== undefined && input.existingPaths.has(path));
  const product = exists([input.snapshot.product?.ref?.path]);
  const ancestorPaths = exists(ancestors.map(({ ref }) => ref?.path));
  const targetPaths = exists([node?.ref?.path]);
  const decisions = exists((node === undefined
    ? input.snapshot.decisions.filter(({ parentId }) => parentId === undefined)
    : specContextDecisions(input.snapshot, contextNodes)).map(({ ref }) => ref?.path));
  const lowerIndexSiblings = exists(
    specContextLowerIndexSiblings(input.snapshot, contextNodes).map(({ ref }) => ref?.path),
  );
  const citedDecisions = await manifestCitations(input, [
    ...product,
    ...ancestorPaths,
    ...targetPaths,
    ...decisions,
    ...lowerIndexSiblings,
  ]);
  const directories = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    ...contextNodes.map(({ id }) => `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${id}`),
  ];
  const overlays = [...input.existingPaths].filter(isLocalOverlayPath).sort(compareSpecContextOrdinal);
  return assembleSpecContextTargetReadSet(target.path, {
    product,
    ancestors: ancestorPaths,
    target: targetPaths,
    decisions,
    lowerIndexSiblings,
    coordination: exists(
      directories.flatMap((directory) => SPEC_TREE_GRAMMAR.COORDINATION_NOTES.map((name) => `${directory}/${name}`)),
    ),
    citedDecisions,
    lifecycleOverlay: exists([SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH]),
    evidence: node === undefined ? [] : exists(specContextEvidence(input.snapshot, node).map(({ ref }) => ref?.path)),
    guides: exists(
      ["", ...directories].flatMap((directory) =>
        SPEC_TREE_GRAMMAR.GUIDE_FILES.map((name) => directory.length === 0 ? name : `${directory}/${name}`)
      ),
    ),
    overlays: overlays.filter((path) => path !== SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH),
    sameIndexSiblings: siblings.filter((sibling) => sibling.order === node?.order).map(({ id }) =>
      `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${id}`
    ).sort(compareSpecContextOrdinal),
    higherIndexSiblings: (node === undefined ? input.snapshot.nodes : siblings.filter((sibling) =>
      sibling.order > node.order
    ))
      .map(({ id }) => `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${id}`).sort(compareSpecContextOrdinal),
  });
}

export async function resolveContextManifest(options: ContextOptions): Promise<SpecContextManifestResolution> {
  const input = await readContextInput(options);
  const resolved = await resolveContextTargets(input, options.targets);
  if (!resolved.ok) return resolved;
  const sets: SpecContextTargetReadSet[] = [];
  for (const target of resolved.targets) sets.push(await targetReadSet(input, target));
  return {
    ok: true,
    manifest: {
      schemaVersion: SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
      methodology: resolveMethodologyIdentity(input.methodology),
      productDir: input.productDir,
      bootstrap: specContextBootstrap(input.snapshot.allNodes.length),
      ...composeSpecContextBundle(sets),
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
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.READ)}:`,
    ...manifest.read.map((document) =>
      terminal`  - ${externalValue(document.roles.map(({ role, target }) => `${role}@${target}`).join(", "))}: ${
        externalValue(document.path)
      }${
        document.citedBy === undefined
          ? authoredText("")
          : terminal` (cited by ${externalValue(document.citedBy.join(", "))})`
      }`
    ),
    terminal`${authoredText(SPEC_CONTEXT_TEXT_LABEL.LISTED)}:`,
    ...manifest.listed.map((entry) =>
      terminal`  - ${externalValue(entry.roles.map(({ role, target }) => `${role}@${target}`).join(", "))}: ${
        externalValue(entry.path)
      }`
    ),
  ];
  return joinTerminalText(authoredText("\n"), lines);
}

export function renderSpecContextJson(manifest: SpecContextManifest): TerminalText {
  return jsonDocument(manifest, 2);
}
