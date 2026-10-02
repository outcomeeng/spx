import * as fc from "fast-check";

import type { Config } from "@/config/types";
import {
  arbitraryMigratingMethodology,
  type GeneratedMigratingMethodology,
} from "@testing/generators/config/descriptors";

import {
  arbitraryDecisionEntry,
  arbitraryNodeEntry,
  type SpecTreeFixtureEntry,
} from "@testing/generators/test-environment/test-environment";

import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import { METHODOLOGY_CODING_AGENT, METHODOLOGY_CODING_AGENTS, type MethodologyCodingAgent } from "@/lib/methodology";
import {
  DECISION_KINDS,
  type DecisionKind,
  KIND_REGISTRY,
  NODE_SUFFIXES,
  SPEC_CONTEXT_DOCUMENT_OPENING,
  SPEC_CONTEXT_OPTIONAL_ARTIFACT,
  SPEC_CONTEXT_TARGET_FAILURE_KIND,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_SUPERSEDED_NODE_SUFFIXES,
  type SpecContextTargetFailure,
  type SpecContextTargetFailureKind,
} from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  type RepresentativeSpecTreeFixture,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import {
  TERMINAL_ORACLE_UNSAFE_CODE_POINTS,
  terminalOracleHexEscape,
} from "@testing/generators/terminal-text/terminal-text";

/** The accepted context target classes the resolution spec declares. */
const SPEC_CONTEXT_TARGET_CLASS_VALUES = {
  PRODUCT_ROOT: "root-directory-target",
  PRODUCT_SPEC: "product-spec-target",
  NODE_DIRECTORY: "node-directory-target",
  NODE_SPEC: "node-spec-target",
  NODE_DECISION: "node-decision-target",
  ROOT_DECISION: "root-decision-target",
} as const;

/** The operand spellings the resolution spec admits for a relative or absolute target. */
const SPEC_CONTEXT_TARGET_SPELLING_VALUES = {
  ROOT_RELATIVE: "root-relative",
  TRAILING_SEPARATOR: "trailing-separator",
  ABSOLUTE: "absolute",
  INVOCATION_RELATIVE: "invocation-relative",
  SUFFIX: "suffix",
} as const;

/** Whether an unsupported artifact is written as a file or created as a directory. */
const SPEC_CONTEXT_ARTIFACT_SHAPE = {
  FILE: "file",
  DIRECTORY: "directory",
} as const;

type SpecContextArtifactShape = (typeof SPEC_CONTEXT_ARTIFACT_SHAPE)[keyof typeof SPEC_CONTEXT_ARTIFACT_SHAPE];

/** Where an unsupported artifact sits: inside the fixture's root node, or directly under the tree root. */
type SpecContextUnsupportedArtifactLayout = {
  /** The tree-rooted directory of the fixture's root node. */
  readonly node: string;
  /** The tree root directory. */
  readonly tree: string;
  /** A slug no fixture node uses, naming rule directories and free-named artifacts. */
  readonly slug: string;
};

type SpecContextUnsupportedArtifactMember = {
  readonly label: string;
  readonly shape: SpecContextArtifactShape;
  readonly path: (layout: SpecContextUnsupportedArtifactLayout) => string;
};

function joinArtifactPath(...segments: readonly string[]): string {
  return segments.join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
}

function unsupportedFile(
  label: string,
  path: SpecContextUnsupportedArtifactMember["path"],
): SpecContextUnsupportedArtifactMember {
  return { label, shape: SPEC_CONTEXT_ARTIFACT_SHAPE.FILE, path };
}

function unsupportedDirectory(
  label: string,
  path: SpecContextUnsupportedArtifactMember["path"],
): SpecContextUnsupportedArtifactMember {
  return { label, shape: SPEC_CONTEXT_ARTIFACT_SHAPE.DIRECTORY, path };
}

/** A test-evidence filename in one language's tail; its mode and level are incidental, drawn under the pinned seed. */
function evidenceFilename(slug: string, tail: readonly string[]): string {
  const { mode, level } = sampleGeneratedValue(fc.record({
    mode: fc.constantFrom(...SPEC_TREE_GRAMMAR.EVIDENCE.MODES),
    level: fc.constantFrom(...SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS),
  }));
  return [slug, mode, level, ...tail].join(SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR);
}

/**
 * Every artifact the spec-tree grammar declares, keyed by the grammar's own
 * fields. The record is total over `SPEC_TREE_GRAMMAR`, so a grammar field
 * added in production fails to compile here until its artifacts join the
 * rejected domain or the field is recorded as naming no artifact.
 */
const UNSUPPORTED_ARTIFACTS_BY_GRAMMAR_FIELD: {
  readonly [Field in keyof typeof SPEC_TREE_GRAMMAR]: readonly SpecContextUnsupportedArtifactMember[];
} = {
  // Accepted target classes: the product spec and node spec files.
  PRODUCT_SUFFIX: [],
  SPEC_FILE: [],
  // Naming grammar: filename segments and separators, not artifacts an operand can name.
  RUNNERS: [],
  ORDER: [],
  PATH_SEPARATOR: [],
  // Node-directory suffixes, covered by the superseded-suffix unresolved shape.
  PRIOR_NODE_SUFFIXES: [],
  // The same notes `COORDINATION_NOTES` lists.
  COORDINATION_NOTE: [],
  EVIDENCE: [
    unsupportedDirectory(
      "test-evidence-directory",
      ({ node }) => joinArtifactPath(node, SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME),
    ),
    ...Object.entries(SPEC_TREE_GRAMMAR.EVIDENCE.TAILS).map(([language, tail]) =>
      unsupportedFile(
        `${language.toLowerCase()}-test-evidence-file`,
        ({ node, slug }) =>
          joinArtifactPath(node, SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME, evidenceFilename(slug, tail)),
      )
    ),
  ],
  COORDINATION_NOTES: SPEC_TREE_GRAMMAR.COORDINATION_NOTES.flatMap((note) => [
    unsupportedFile(`node-${note}`, ({ node }) => joinArtifactPath(node, note)),
    unsupportedFile(`tree-root-${note}`, ({ tree }) => joinArtifactPath(tree, note)),
  ]),
  GUIDE_FILES: SPEC_TREE_GRAMMAR.GUIDE_FILES.flatMap((guide) => [
    unsupportedFile(`node-${guide}`, ({ node }) => joinArtifactPath(node, guide)),
    unsupportedFile(`tree-root-${guide}`, ({ tree }) => joinArtifactPath(tree, guide)),
  ]),
  STATUS_FILENAME: [
    unsupportedFile("node-status-claim", ({ node }) => joinArtifactPath(node, SPEC_TREE_GRAMMAR.STATUS_FILENAME)),
  ],
  LOCAL_OVERLAYS: [
    unsupportedDirectory(
      "local-overlay-directory",
      ({ tree }) => joinArtifactPath(tree, SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME),
    ),
    unsupportedFile(
      "lifecycle-overlay",
      ({ tree }) =>
        joinArtifactPath(
          tree,
          SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME,
          SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.LIFECYCLE_FILENAME,
        ),
    ),
    unsupportedFile(
      "local-overlay",
      ({ tree, slug }) =>
        joinArtifactPath(
          tree,
          SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME,
          `${slug}${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION}`,
        ),
    ),
  ],
  EVAL: [
    unsupportedDirectory("eval-directory", ({ node }) => joinArtifactPath(node, SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME)),
    unsupportedDirectory(
      "eval-rule-directory",
      ({ node, slug }) => joinArtifactPath(node, SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME, slug),
    ),
    ...SPEC_TREE_GRAMMAR.EVAL.FILES.map((filename) =>
      unsupportedFile(
        `eval-${filename}`,
        ({ node, slug }) => joinArtifactPath(node, SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME, slug, filename),
      )
    ),
    unsupportedDirectory(
      "eval-runs-directory",
      ({ node, slug }) =>
        joinArtifactPath(node, SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME, slug, SPEC_TREE_GRAMMAR.EVAL.RUNS_DIRECTORY_NAME),
    ),
  ],
  PROBE: [
    unsupportedDirectory(
      "probe-directory",
      ({ node }) => joinArtifactPath(node, SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME),
    ),
    unsupportedDirectory(
      "probe-protocol-directory",
      ({ node, slug }) => joinArtifactPath(node, SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME, slug),
    ),
    unsupportedFile(
      "probe-protocol",
      ({ node, slug }) =>
        joinArtifactPath(node, SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME, slug, SPEC_TREE_GRAMMAR.PROBE.PROTOCOL_FILENAME),
    ),
    unsupportedDirectory(
      "probe-runs-directory",
      ({ node, slug }) =>
        joinArtifactPath(
          node,
          SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME,
          slug,
          SPEC_TREE_GRAMMAR.PROBE.RUNS_DIRECTORY_NAME,
        ),
    ),
  ],
};

/**
 * Every optional artifact a context projection may select, keyed by the
 * projection's own registry and total over it, for the same reason.
 */
const UNSUPPORTED_ARTIFACTS_BY_OPTIONAL_ARTIFACT: {
  readonly [Artifact in keyof typeof SPEC_CONTEXT_OPTIONAL_ARTIFACT]: readonly SpecContextUnsupportedArtifactMember[];
} = {
  // The same note `SPEC_TREE_GRAMMAR.COORDINATION_NOTES` lists.
  ISSUES: [],
  KNOWLEDGE_INDEX: [
    unsupportedDirectory(
      "knowledge-root",
      ({ node }) =>
        joinArtifactPath(
          node,
          ...SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR).slice(0, -1),
        ),
    ),
    unsupportedFile(
      "knowledge-index",
      ({ node }) => joinArtifactPath(node, SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX),
    ),
  ],
  OUTCOME_SUFFIX: [
    unsupportedFile(
      "outcome-record",
      ({ node, slug }) => joinArtifactPath(node, `${slug}${SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX}`),
    ),
  ],
};

const SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_MEMBERS: readonly SpecContextUnsupportedArtifactMember[] = [
  ...Object.values(UNSUPPORTED_ARTIFACTS_BY_GRAMMAR_FIELD).flat(),
  ...Object.values(UNSUPPORTED_ARTIFACTS_BY_OPTIONAL_ARTIFACT).flat(),
];

/**
 * The spellings an unsupported artifact is supplied in, each making one
 * candidate source decisive: root-relative from a nested invocation directory
 * resolves only through the product-root source, and invocation-relative from
 * the artifact's own parent resolves only through the invocation directory.
 */
const SPEC_CONTEXT_UNSUPPORTED_SPELLINGS = [
  SPEC_CONTEXT_TARGET_SPELLING_VALUES.ROOT_RELATIVE,
  SPEC_CONTEXT_TARGET_SPELLING_VALUES.INVOCATION_RELATIVE,
] as const;

type SpecContextUnsupportedSpelling = (typeof SPEC_CONTEXT_UNSUPPORTED_SPELLINGS)[number];

/** The unresolved shapes the resolution spec rejects without guessing. */
const SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES = {
  UNKNOWN_DIRECTORY: "unknown-directory",
  EMPTY: "empty",
  UNREGISTERED_SUFFIX: "unregistered-suffix",
  SUPERSEDED_SUFFIX: "superseded-suffix",
  /** A trailing fragment of a path component, matching no complete component. */
  PARTIAL_COMPONENT: "partial-component-suffix",
  /** A complete-component suffix of a tracked path that is no accepted target. */
  UNACCEPTED_PATH_SUFFIX: "unaccepted-path-suffix",
} as const;

/** The outside-product shapes the resolution spec confines away. */
const SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES = {
  ABSOLUTE_OUTSIDE: "absolute-outside",
  TRAVERSAL: "traversal",
} as const;

export const SPEC_CONTEXT_TARGET_CLASS = SPEC_CONTEXT_TARGET_CLASS_VALUES;
export const SPEC_CONTEXT_TARGET_SPELLING = SPEC_CONTEXT_TARGET_SPELLING_VALUES;
export const SPEC_CONTEXT_UNRESOLVED_SHAPE = SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES;
export const SPEC_CONTEXT_OUTSIDE_SHAPE = SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES;

export type SpecContextTargetClass =
  (typeof SPEC_CONTEXT_TARGET_CLASS_VALUES)[keyof typeof SPEC_CONTEXT_TARGET_CLASS_VALUES];
export type SpecContextTargetSpelling =
  (typeof SPEC_CONTEXT_TARGET_SPELLING_VALUES)[keyof typeof SPEC_CONTEXT_TARGET_SPELLING_VALUES];
export type SpecContextUnresolvedShape =
  (typeof SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES)[keyof typeof SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES];
export type SpecContextOutsideShape =
  (typeof SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES)[keyof typeof SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES];

/**
 * One accepted target class in one operand spelling, and for a decision class
 * one decision kind; the complete finite domain is their cross product.
 */
export type SpecContextAcceptedTargetCase = {
  readonly targetClass: SpecContextTargetClass;
  readonly spelling: SpecContextTargetSpelling;
  /** The decision kind of a decision class; absent for every other class. */
  readonly decisionKind: DecisionKind | undefined;
  readonly title: string;
};

export type SpecContextRejectedTargetCase =
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.UNSUPPORTED_ARTIFACT;
    /** The label of one member of the grammar-total unsupported-artifact domain. */
    readonly artifact: string;
    readonly spelling: SpecContextUnsupportedSpelling;
    readonly title: string;
  }
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED;
    readonly shape: SpecContextUnresolvedShape;
    readonly title: string;
  }
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.OUTSIDE_PRODUCT;
    readonly shape: SpecContextOutsideShape;
    readonly title: string;
  }
  | { readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS; readonly title: string };

export type SpecContextTargetDiagnosticSafetyCase = {
  readonly failure: SpecContextTargetFailure;
  readonly title: string;
  readonly unsafeValue: string;
  /** The rendering the escaping law requires, computed independently of the production sanitizer. */
  readonly expectedEscapedValue: string;
};

/** The paths one accepted-target case denotes: the operand to supply and the canonical identity it must resolve to. */
export type SpecContextAcceptedTargetOperand = {
  /** The operand as the caller spells it. */
  readonly operand: string;
  /** The invocation directory, relative to the product root, the operand is resolved from. */
  readonly invocationDir: string;
  /** The canonical accepted target path the operand must resolve to. */
  readonly expectedTarget: string;
  /** Product-relative artifacts the case needs on disk beyond the materialized fixture. */
  readonly artifacts: readonly { readonly path: string; readonly content: string }[];
};

export type SpecContextRejectedTargetOperand = {
  readonly operand: string;
  readonly invocationDir: string;
  readonly expectedKind: SpecContextTargetFailureKind;
  /** Every canonical accepted-target path an ambiguous operand must report. */
  readonly expectedCandidates: readonly string[];
  readonly artifacts: readonly { readonly path: string; readonly content: string }[];
  readonly directories: readonly string[];
};

/**
 * Byte sequences a strict WHATWG UTF-8 decode rejects: a lone continuation
 * byte, an invalid starter byte, or a truncated multi-byte sequence.
 */
export function arbitrarySpecContextInvalidUtf8Bytes(): fc.Arbitrary<Uint8Array> {
  return fc.oneof(
    fc.integer({ min: 0x80, max: 0xbf }).map((continuation) => Uint8Array.of(continuation)),
    fc.constantFrom(0xc0, 0xc1, 0xf5, 0xfe, 0xff).map((starter) => Uint8Array.of(starter)),
    fc.integer({ min: 0xe0, max: 0xef }).map((truncated) => Uint8Array.of(truncated, 0x20)),
  );
}

/** Citation-shaped text that must bind nothing: bare paths, other link destinations, and off-grammar hrefs. */
export type SpecContextNonCitationShapes = {
  /** Prose shapes written into a spec body; none may bind a selected decision. */
  readonly proseShapes: readonly string[];
  /** The decision path a bare-text or off-grammar shape names; it must never enter the projection through them. */
  readonly unboundDecisionPath: string;
};

export function specContextNonCitationShapes(): SpecContextNonCitationShapes {
  const decisionSuffix = KIND_REGISTRY[DECISION_KINDS[0]].suffix;
  const unboundDecisionPath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/99-shape${decisionSuffix}`;
  return {
    proseShapes: [
      unboundDecisionPath,
      `\`${unboundDecisionPath}\``,
      `[outside](https://example.invalid/${unboundDecisionPath})`,
      `[extended](${unboundDecisionPath}x)`,
      `[backup](${unboundDecisionPath}.bak)`,
      `[embedded](dist/${unboundDecisionPath})`,
    ],
    unboundDecisionPath,
  };
}

/** The vitest `it.each` title token that renders each case's own title. */
export const SPEC_CONTEXT_CASE_TITLE = "$title";

function unregisteredNodeSuffix(seed: string): string {
  const registeredSuffixes = new Set([...NODE_SUFFIXES, ...SPEC_TREE_SUPERSEDED_NODE_SUFFIXES]);
  let candidate = `.${seed}`;
  while (registeredSuffixes.has(candidate)) candidate = `${candidate}-${seed}`;
  return candidate;
}

export function specContextLowerSiblingDirectoryName(fixture: RepresentativeSpecTreeFixture): string {
  const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  const orderPrefix = `${fixture.root.order}-`;
  return `${fixture.root.order - 1}-${rootDirectory.slice(orderPrefix.length)}`;
}

export function specContextSameIndexSiblingDirectoryName(fixture: RepresentativeSpecTreeFixture): string {
  const definition = KIND_REGISTRY[fixture.root.kind];
  return `${fixture.root.order}-${fixture.root.slug}-same${definition.suffix}`;
}

/** A target no accepted path matches, derived from the fixture root's directory name. */
export function specContextUnknownTarget(fixture: RepresentativeSpecTreeFixture): string {
  return `${specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root)}-unknown`;
}

/** The POSIX path segment naming a directory's parent. */
const PARENT_DIRECTORY_SEGMENT = "..";

function rooted(...segments: readonly string[]): string {
  return [SPEC_TREE_CONFIG.ROOT_DIRECTORY, ...segments].join(TRACKED_PATH_DIRECTORY_SEPARATOR);
}

function specContent(title: string, opening: string): string {
  return `# ${title}\n\n${opening} generated fixture content\nSO THAT spec-tree tests\nCAN read current nodes\n`;
}

/** The product-relative path of the fixture's representative documents. */
export function specContextFixtureDocuments(fixture: RepresentativeSpecTreeFixture): {
  readonly rootDirectory: string;
  readonly childDirectory: string;
  readonly peerDirectory: string;
  readonly productSpecPath: string;
  readonly rootSpecPath: string;
  readonly childSpecPath: string;
  readonly nodeDecisionPath: string;
  readonly rootTargetPath: string;
  readonly childTargetPath: string;
} {
  const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.child);
  const peerDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.peer);
  const decisionSuffix = KIND_REGISTRY[fixture.decision.kind].suffix;
  return {
    rootDirectory,
    childDirectory,
    peerDirectory,
    productSpecPath: rooted(`${fixture.product.title}${SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX}`),
    rootSpecPath: rooted(rootDirectory, `${fixture.root.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`),
    childSpecPath: rooted(
      rootDirectory,
      childDirectory,
      `${fixture.child.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
    ),
    nodeDecisionPath: rooted(
      rootDirectory,
      `${fixture.decision.order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${fixture.decision.slug}${decisionSuffix}`,
    ),
    rootTargetPath: rooted(rootDirectory),
    childTargetPath: rooted(rootDirectory, childDirectory),
  };
}

/** A product-root decision written beside the fixture, of the given kind. */
export function specContextRootDecisionPath(fixture: RepresentativeSpecTreeFixture, kind: DecisionKind): string {
  return rooted(
    `${fixture.peer.order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${fixture.decision.slug}${KIND_REGISTRY[kind].suffix}`,
  );
}

/** A decision of the given kind inside the fixture's root node, beside the fixture's own decision. */
export function specContextNodeDecisionPath(fixture: RepresentativeSpecTreeFixture, kind: DecisionKind): string {
  return rooted(
    specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root),
    `${fixture.decision.order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${fixture.decision.slug}${
      KIND_REGISTRY[kind].suffix
    }`,
  );
}

const SPEC_CONTEXT_DECISION_TARGET_CLASSES: ReadonlySet<SpecContextTargetClass> = new Set([
  SPEC_CONTEXT_TARGET_CLASS_VALUES.NODE_DECISION,
  SPEC_CONTEXT_TARGET_CLASS_VALUES.ROOT_DECISION,
]);

/**
 * The complete accepted-target domain: every declared class in every admitted
 * spelling, with each decision class enumerated over every source-owned
 * decision kind.
 */
export function specContextAcceptedTargetCases(): readonly SpecContextAcceptedTargetCase[] {
  return Object.values(SPEC_CONTEXT_TARGET_CLASS_VALUES).flatMap((targetClass) =>
    (SPEC_CONTEXT_DECISION_TARGET_CLASSES.has(targetClass) ? DECISION_KINDS : [undefined]).flatMap((decisionKind) =>
      Object.values(SPEC_CONTEXT_TARGET_SPELLING_VALUES).map((spelling) => ({
        targetClass,
        spelling,
        decisionKind,
        title: `maps a ${spelling} ${
          decisionKind === undefined ? "" : `${decisionKind} `
        }${targetClass} operand ${"to its canonical target and that target's projection"}`,
      }))
    )
  );
}

function requiredDecisionKind(mappingCase: SpecContextAcceptedTargetCase): DecisionKind {
  if (mappingCase.decisionKind === undefined) {
    throw new Error(`Accepted ${mappingCase.targetClass} case carries no decision kind`);
  }
  return mappingCase.decisionKind;
}

/**
 * The canonical path of each class is the construction law: a product spec, a
 * node spec, and a decision all identify their containing node or the product
 * root. A decision case writes its decision so every kind is present on disk.
 */
function canonicalAcceptedTarget(
  fixture: RepresentativeSpecTreeFixture,
  mappingCase: SpecContextAcceptedTargetCase,
): {
  readonly path: string;
  readonly target: string;
  readonly artifacts: readonly { readonly path: string; readonly content: string }[];
} {
  const documents = specContextFixtureDocuments(fixture);
  const decision = (path: string, target: string) => ({
    path,
    target,
    artifacts: [{ path, content: specContent("Target decision", SPEC_CONTEXT_DOCUMENT_OPENING.DECISION) }],
  });
  switch (mappingCase.targetClass) {
    case SPEC_CONTEXT_TARGET_CLASS_VALUES.PRODUCT_ROOT:
      return { path: SPEC_TREE_CONFIG.ROOT_DIRECTORY, target: SPEC_TREE_CONFIG.ROOT_DIRECTORY, artifacts: [] };
    case SPEC_CONTEXT_TARGET_CLASS_VALUES.PRODUCT_SPEC:
      return { path: documents.productSpecPath, target: SPEC_TREE_CONFIG.ROOT_DIRECTORY, artifacts: [] };
    case SPEC_CONTEXT_TARGET_CLASS_VALUES.NODE_DIRECTORY:
      return { path: documents.childTargetPath, target: documents.childTargetPath, artifacts: [] };
    case SPEC_CONTEXT_TARGET_CLASS_VALUES.NODE_SPEC:
      return { path: documents.childSpecPath, target: documents.childTargetPath, artifacts: [] };
    case SPEC_CONTEXT_TARGET_CLASS_VALUES.NODE_DECISION:
      return decision(
        specContextNodeDecisionPath(fixture, requiredDecisionKind(mappingCase)),
        documents.rootTargetPath,
      );
    case SPEC_CONTEXT_TARGET_CLASS_VALUES.ROOT_DECISION:
      return decision(
        specContextRootDecisionPath(fixture, requiredDecisionKind(mappingCase)),
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
      );
  }
}

/**
 * The operand one accepted case supplies and the identity it must resolve to;
 * every spelling is a mechanical re-spelling of the class's canonical path.
 */
export function specContextAcceptedTargetOperand(
  fixture: RepresentativeSpecTreeFixture,
  productDir: string,
  mappingCase: SpecContextAcceptedTargetCase,
): SpecContextAcceptedTargetOperand {
  const documents = specContextFixtureDocuments(fixture);
  const canonical = canonicalAcceptedTarget(fixture, mappingCase);
  const artifacts = canonical.artifacts;
  const segments = canonical.path.split(TRACKED_PATH_DIRECTORY_SEPARATOR);
  switch (mappingCase.spelling) {
    case SPEC_CONTEXT_TARGET_SPELLING_VALUES.ROOT_RELATIVE:
      return { operand: canonical.path, invocationDir: "", expectedTarget: canonical.target, artifacts };
    case SPEC_CONTEXT_TARGET_SPELLING_VALUES.TRAILING_SEPARATOR:
      return {
        operand: `${canonical.path}${TRACKED_PATH_DIRECTORY_SEPARATOR}`,
        invocationDir: "",
        expectedTarget: canonical.target,
        artifacts,
      };
    case SPEC_CONTEXT_TARGET_SPELLING_VALUES.ABSOLUTE:
      return {
        operand: [productDir, canonical.path].join(TRACKED_PATH_DIRECTORY_SEPARATOR),
        invocationDir: "",
        expectedTarget: canonical.target,
        artifacts,
      };
    case SPEC_CONTEXT_TARGET_SPELLING_VALUES.INVOCATION_RELATIVE:
      // The last path component from its own parent directory.
      return {
        operand: segments.at(-1) ?? canonical.path,
        invocationDir: segments.slice(0, -1).join(TRACKED_PATH_DIRECTORY_SEPARATOR),
        expectedTarget: canonical.target,
        artifacts,
      };
    case SPEC_CONTEXT_TARGET_SPELLING_VALUES.SUFFIX:
      // The complete-component suffix without the tree root, from a
      // directory that holds no such path, so only suffix matching binds it.
      return {
        operand: segments.length > 1
          ? segments.slice(1).join(TRACKED_PATH_DIRECTORY_SEPARATOR)
          : canonical.path,
        invocationDir: documents.peerDirectory.length > 0 ? rooted(documents.peerDirectory) : "",
        expectedTarget: canonical.target,
        artifacts,
      };
  }
}

/** The complete rejected-target domain: every failure kind with each declared shape. */
export function specContextRejectedTargetCases(): readonly SpecContextRejectedTargetCase[] {
  return [
    ...SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_MEMBERS.flatMap(({ label }) =>
      SPEC_CONTEXT_UNSUPPORTED_SPELLINGS.map((spelling) => ({
        kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.UNSUPPORTED_ARTIFACT,
        artifact: label,
        spelling,
        title: `maps a ${spelling} ${label} artifact operand to the unsupported-artifact failure`,
      }))
    ),
    ...Object.values(SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES).map((shape) => ({
      kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED,
      shape,
      title: `maps a ${shape} operand to the unresolved failure`,
    })),
    ...Object.values(SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES).map((shape) => ({
      kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.OUTSIDE_PRODUCT,
      shape,
      title: `maps an ${shape} operand to the outside-product failure`,
    })),
    {
      kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS,
      title: "maps an operand two accepted targets share as a suffix to the ambiguous failure naming both",
    },
  ];
}

/** A nested directory whose name repeats the fixture root's, so one suffix denotes two node identities. */
export function specContextAmbiguousNestedDirectory(fixture: RepresentativeSpecTreeFixture): {
  readonly nestedTargetPath: string;
  readonly nestedSpecPath: string;
  readonly nestedSpecContent: string;
  readonly operand: string;
} {
  const documents = specContextFixtureDocuments(fixture);
  const nestedTargetPath = rooted(documents.peerDirectory, documents.rootDirectory);
  return {
    nestedTargetPath,
    nestedSpecPath: `${nestedTargetPath}/${fixture.root.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
    nestedSpecContent: specContent("Nested namesake", KIND_REGISTRY[fixture.root.kind].opening),
    operand: documents.rootDirectory,
  };
}

/**
 * An operand that steps into `alias` and back out with a parent segment
 * before naming `target`. Lexical normalization reduces it to `target`; a
 * physical walk through a symbolic-link `alias` lands elsewhere.
 */
export function specContextLexicalDetourOperand(alias: string, target: string): string {
  return [alias, PARENT_DIRECTORY_SEGMENT, target].join(TRACKED_PATH_DIRECTORY_SEPARATOR);
}

/** The escape-target document a containment case writes outside the product root. */
export function specContextOutsideDocument(): string {
  return specContent("Outside the product", SPEC_CONTEXT_DOCUMENT_OPENING.DECISION);
}

/**
 * Two decisions under the peer directory whose citation order is the reverse
 * of their canonical path order. Both share one index and differ only in the
 * first character of their slug, "Z" against "a": by the canonical ordinal
 * comparison the "Z" path precedes the "a" path, while locale collation and
 * citation order both put the "a" path first. A projection that appended
 * citations in discovery order, or compared paths by locale, emits them the
 * other way round.
 */
export function specContextDivergentCitationDecisions(fixture: RepresentativeSpecTreeFixture): {
  readonly citedFirst: { readonly path: string; readonly content: string };
  readonly citedSecond: { readonly path: string; readonly content: string };
} {
  const documents = specContextFixtureDocuments(fixture);
  const suffix = KIND_REGISTRY[fixture.decision.kind].suffix;
  const slug = sampleGeneratedValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const decision = (name: string) => ({
    path: rooted(
      documents.peerDirectory,
      `${fixture.peer.order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${name}${suffix}`,
    ),
    content: specContent(name, SPEC_CONTEXT_DOCUMENT_OPENING.DECISION),
  });
  return {
    citedFirst: decision(`a${slug}`),
    citedSecond: decision(`Z${slug}`),
  };
}

/**
 * A decision path under `directory` that names no tracked file: the order and
 * slug are drawn, and the kind suffix comes from the fixture's own decision.
 */
export function specContextAbsentDecisionPath(fixture: RepresentativeSpecTreeFixture, directory: string): string {
  const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  return rooted(
    directory,
    `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${KIND_REGISTRY[fixture.decision.kind].suffix}`,
  );
}

/**
 * The fixture root's directory name with its slug truncated to its first
 * character: a strict prefix of exactly one accepted component, and a
 * complete component of no tracked path. The order prefix it keeps is unique
 * among the fixture's nodes and decisions, so a resolver admitting unique
 * abbreviated prefixes would resolve it to the root node.
 */
export function specContextAbbreviatedRootPrefix(fixture: RepresentativeSpecTreeFixture): string {
  return `${fixture.root.order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${fixture.root.slug.slice(0, 1)}`;
}

/**
 * The body a node-shaped fixture document carries: the title plus the opening
 * its kind declares, so a case that expects a node to be resolved or excluded
 * is never satisfied by a document the Digest projection cannot read.
 */
export function specContextFixtureSpecContent(fixture: RepresentativeSpecTreeFixture, title: string): string {
  return specContent(title, KIND_REGISTRY[fixture.root.kind].opening);
}

/** The inert status-claim payload a fixture writes to make a node-shaped directory tracked. */
export const SPEC_CONTEXT_FIXTURE_STATUS_BODY = "{}";

export function specContextRejectedTargetOperand(
  fixture: RepresentativeSpecTreeFixture,
  productDir: string,
  outsideDir: string,
  mappingCase: SpecContextRejectedTargetCase,
): SpecContextRejectedTargetOperand {
  const documents = specContextFixtureDocuments(fixture);
  const none: SpecContextRejectedTargetOperand = {
    operand: "",
    invocationDir: "",
    expectedKind: mappingCase.kind,
    expectedCandidates: [],
    artifacts: [],
    directories: [],
  };
  switch (mappingCase.kind) {
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.UNSUPPORTED_ARTIFACT: {
      const member = SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_MEMBERS.find(({ label }) => label === mappingCase.artifact);
      if (member === undefined) throw new Error(`Unknown unsupported artifact: ${mappingCase.artifact}`);
      const path = member.path({
        node: documents.rootTargetPath,
        tree: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        slug: fixture.decision.slug,
      });
      const placement = member.shape === SPEC_CONTEXT_ARTIFACT_SHAPE.FILE
        ? { artifacts: [{ path, content: "" }] }
        : { directories: [path] };
      const segments = path.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
      return mappingCase.spelling === SPEC_CONTEXT_TARGET_SPELLING_VALUES.ROOT_RELATIVE
        ? { ...none, ...placement, operand: path, invocationDir: rooted(documents.peerDirectory) }
        : {
          ...none,
          ...placement,
          operand: segments.at(-1) ?? path,
          invocationDir: segments.slice(0, -1).join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
        };
    }
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED: {
      switch (mappingCase.shape) {
        case SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES.UNKNOWN_DIRECTORY:
          return { ...none, operand: specContextUnknownTarget(fixture) };
        case SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES.EMPTY:
          return { ...none, operand: "" };
        case SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES.UNREGISTERED_SUFFIX: {
          const directory = `${fixture.root.order}-${fixture.root.slug}${
            unregisteredNodeSuffix(fixture.decision.slug)
          }`;
          return { ...none, operand: directory, directories: [rooted(directory)] };
        }
        case SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES.SUPERSEDED_SUFFIX: {
          const directory = `${fixture.root.order}-${fixture.root.slug}${SPEC_TREE_SUPERSEDED_NODE_SUFFIXES[0]}`;
          return { ...none, operand: directory, directories: [rooted(directory)] };
        }
        case SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES.PARTIAL_COMPONENT: {
          // The root node's directory without its order prefix: a trailing
          // fragment of the component, never a complete one.
          return {
            ...none,
            operand: documents.rootDirectory.slice(`${fixture.root.order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}`.length),
          };
        }
        case SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES.UNACCEPTED_PATH_SUFFIX: {
          // A complete component of a tracked path that is no accepted
          // target: the evidence directory under the root node.
          const directory = rooted(documents.rootDirectory, SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME);
          return {
            ...none,
            operand: SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME,
            directories: [directory],
          };
        }
      }
    }
    // falls through: every unresolved shape returned above
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.OUTSIDE_PRODUCT: {
      switch (mappingCase.shape) {
        case SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES.ABSOLUTE_OUTSIDE:
          return { ...none, operand: outsideDir };
        case SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES.TRAVERSAL:
          return {
            ...none,
            operand: `${PARENT_DIRECTORY_SEGMENT}${TRACKED_PATH_DIRECTORY_SEPARATOR}${documents.rootDirectory}`,
          };
      }
    }
    // falls through: every outside shape returned above
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS: {
      const nested = specContextAmbiguousNestedDirectory(fixture);
      return {
        ...none,
        operand: nested.operand,
        expectedCandidates: [documents.rootTargetPath, nested.nestedTargetPath],
        artifacts: [{
          path: nested.nestedSpecPath,
          content: specContent("Nested namesake", KIND_REGISTRY[fixture.root.kind].opening),
        }],
      };
    }
  }
}

/** Every failure kind with a control-byte or DEL input and candidate, for the diagnostic-safety mapping. */
export function specContextTargetDiagnosticSafetyCases(): readonly SpecContextTargetDiagnosticSafetyCase[] {
  return TERMINAL_ORACLE_UNSAFE_CODE_POINTS.flatMap((code) => {
    const expectedEscapedValue = terminalOracleHexEscape(code);
    const unsafeValue = String.fromCodePoint(code);
    return Object.values(SPEC_CONTEXT_TARGET_FAILURE_KIND).map((kind) => ({
      failure: {
        kind,
        input: unsafeValue,
        candidates: kind === SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS ? [unsafeValue] : [],
      },
      title: `escapes ${expectedEscapedValue} in ${kind} diagnostics`,
      unsafeValue,
      expectedEscapedValue,
    }));
  });
}

/**
 * The complete input of one determinism case: the representative tree, one
 * extra node directory and one extra decision file, an open migration whose
 * declared version names the shipped fixture tree, and that tree's resource
 * slug. Every value the case materializes comes from this record, so a
 * failing case replays and shrinks from its reported seed alone.
 */
export type GeneratedContextDeterminismCase = {
  readonly fixture: RepresentativeSpecTreeFixture;
  readonly extraDecision: SpecTreeFixtureEntry;
  readonly extraNode: SpecTreeFixtureEntry;
  readonly migrating: GeneratedMigratingMethodology;
  readonly methodologySlug: string;
};

function withOpening(entry: SpecTreeFixtureEntry, opening: string): SpecTreeFixtureEntry {
  return { ...entry, contents: `${entry.contents}\n${opening} ${entry.path}\n` };
}

/** Every generated document carries the opening its Digest projection selects, so both projections render it. */
export function arbitraryContextDeterminismCase(config: Config): fc.Arbitrary<GeneratedContextDeterminismCase> {
  return fc.record({
    fixture: SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY),
    extraDecision: arbitraryDecisionEntry(config).map((entry) =>
      withOpening(entry, SPEC_CONTEXT_DOCUMENT_OPENING.DECISION)
    ),
    extraNode: arbitraryNodeEntry(config).map((entry) => {
      const opening = KIND_REGISTRY[entry.kind as keyof typeof KIND_REGISTRY];
      return withOpening(entry, "opening" in opening ? opening.opening : SPEC_CONTEXT_DOCUMENT_OPENING.DECISION);
    }),
    migrating: arbitraryMigratingMethodology(),
    methodologySlug: SPEC_TREE_TEST_GENERATOR.sourceSlug(),
  });
}

/** One subset of the invocation markers and the coding agent the declared precedence selects for it. */
export type SpecContextCodingAgentMarkerCase = {
  readonly markers: Readonly<Record<string, string>>;
  readonly expected: MethodologyCodingAgent | undefined;
  readonly title: string;
};

/** A marker subset that names one shipped coding agent, so its expectation is never absent. */
export type SpecContextCodingAgentWitnessCase = SpecContextCodingAgentMarkerCase & {
  readonly expected: MethodologyCodingAgent;
};

/**
 * The invocation marker keys that name each shipped coding agent, listed in the
 * precedence the harness-environment descriptor declares. The record is total
 * over the shipped agents, so an agent added to the line without its marker
 * keys fails to compile.
 */
const CODING_AGENT_MARKER_KEYS: Record<MethodologyCodingAgent, readonly [string, ...(readonly string[])]> = {
  [METHODOLOGY_CODING_AGENT.CLAUDE]: [
    HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID,
    HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE,
  ],
  [METHODOLOGY_CODING_AGENT.CODEX]: [HOOK_SESSION_START_ENV.CODEX_THREAD_ID],
};

/**
 * The complete subset domain over the source-owned invocation marker keys,
 * with the spec's precedence law as the expectation: a Codex marker selects
 * Codex before any Claude Code marker, either Claude Code marker alone selects
 * Claude Code, and no marker selects no agent.
 */
export function specContextCodingAgentMarkerCases(marker: string): readonly SpecContextCodingAgentMarkerCase[] {
  const codexKeys = CODING_AGENT_MARKER_KEYS[METHODOLOGY_CODING_AGENT.CODEX];
  const claudeKeys = CODING_AGENT_MARKER_KEYS[METHODOLOGY_CODING_AGENT.CLAUDE];
  const keys = [...codexKeys, ...claudeKeys];
  return Array.from({ length: 2 ** keys.length }, (_unused, mask) => {
    const present = keys.filter((_key, index) => (mask & (1 << index)) !== 0);
    const expected = present.some((key) => codexKeys.includes(key))
      ? METHODOLOGY_CODING_AGENT.CODEX
      : present.some((key) => claudeKeys.includes(key))
      ? METHODOLOGY_CODING_AGENT.CLAUDE
      : undefined;
    return {
      markers: Object.fromEntries(present.map((key) => [key, marker])),
      expected,
      title: `maps markers {${present.join(", ")}} to ${expected ?? "no agent"}`,
    };
  });
}

/**
 * One marker subset per shipped coding agent, each naming that agent alone.
 * The subprocess boundary needs a witness for every agent the shipped line can
 * select; the complete subset domain above belongs to the pure derivation,
 * which reaches it without spawning a process.
 */
export function specContextCodingAgentWitnessCases(marker: string): readonly SpecContextCodingAgentWitnessCase[] {
  return METHODOLOGY_CODING_AGENTS.map((agent) => {
    const key = CODING_AGENT_MARKER_KEYS[agent][0];
    return {
      markers: { [key]: marker },
      expected: agent,
      title: `maps markers {${key}} to ${agent}`,
    };
  });
}
