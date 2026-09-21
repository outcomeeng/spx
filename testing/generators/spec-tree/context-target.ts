import * as fc from "fast-check";

import type { Config } from "@/config/types";

import {
  arbitraryDecisionEntry,
  arbitraryNodeEntry,
  type SpecTreeFixtureEntry,
} from "@testing/generators/test-environment/test-environment";

import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import { METHODOLOGY_CODING_AGENT, type MethodologyCodingAgent } from "@/lib/methodology";
import { CONTROL_CHAR_UPPER_BOUND, DEL_CHAR_CODE, formatHexEscape } from "@/lib/sanitize-cli-argument";
import {
  DECISION_KINDS,
  type DecisionKind,
  KIND_REGISTRY,
  NODE_SUFFIXES,
  SPEC_CONTEXT_DOCUMENT_OPENING,
  SPEC_CONTEXT_TARGET_FAILURE_KIND,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_SUPERSEDED_NODE_SUFFIXES,
  type SpecContextTargetFailure,
  type SpecContextTargetFailureKind,
} from "@/lib/spec-tree";
import {
  type RepresentativeSpecTreeFixture,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";

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

/** The artifact classes the resolution spec rejects as unsupported. */
const SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_VALUES = {
  NODE_PLAN: SPEC_TREE_GRAMMAR.COORDINATION_NOTES[0],
  NODE_ISSUES: SPEC_TREE_GRAMMAR.COORDINATION_NOTES[1],
  NODE_STATUS: SPEC_TREE_GRAMMAR.STATUS_FILENAME,
  RUNTIME_GUIDE: SPEC_TREE_GRAMMAR.GUIDE_FILES[0],
  AGENT_GUIDE: SPEC_TREE_GRAMMAR.GUIDE_FILES[1],
  TEST_EVIDENCE: SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME,
  EVAL_EVIDENCE: SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME,
  ROOT_PLAN: "root-plan",
} as const;

/** The unresolved shapes the resolution spec rejects without guessing. */
const SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES = {
  UNKNOWN_DIRECTORY: "unknown-directory",
  EMPTY: "empty",
  UNREGISTERED_SUFFIX: "unregistered-suffix",
  SUPERSEDED_SUFFIX: "superseded-suffix",
} as const;

/** The outside-product shapes the resolution spec confines away. */
const SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES = {
  ABSOLUTE_OUTSIDE: "absolute-outside",
  TRAVERSAL: "traversal",
} as const;

export const SPEC_CONTEXT_TARGET_CLASS = SPEC_CONTEXT_TARGET_CLASS_VALUES;
export const SPEC_CONTEXT_TARGET_SPELLING = SPEC_CONTEXT_TARGET_SPELLING_VALUES;
export const SPEC_CONTEXT_UNSUPPORTED_ARTIFACT = SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_VALUES;
export const SPEC_CONTEXT_UNRESOLVED_SHAPE = SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES;
export const SPEC_CONTEXT_OUTSIDE_SHAPE = SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES;

export type SpecContextTargetClass =
  (typeof SPEC_CONTEXT_TARGET_CLASS_VALUES)[keyof typeof SPEC_CONTEXT_TARGET_CLASS_VALUES];
export type SpecContextTargetSpelling =
  (typeof SPEC_CONTEXT_TARGET_SPELLING_VALUES)[keyof typeof SPEC_CONTEXT_TARGET_SPELLING_VALUES];
export type SpecContextUnsupportedArtifact =
  (typeof SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_VALUES)[keyof typeof SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_VALUES];
export type SpecContextUnresolvedShape =
  (typeof SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES)[keyof typeof SPEC_CONTEXT_UNRESOLVED_SHAPE_VALUES];
export type SpecContextOutsideShape =
  (typeof SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES)[keyof typeof SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES];

/** One accepted target class in one operand spelling; the complete finite domain is their cross product. */
export type SpecContextAcceptedTargetCase = {
  readonly targetClass: SpecContextTargetClass;
  readonly spelling: SpecContextTargetSpelling;
  readonly title: string;
};

export type SpecContextRejectedTargetCase =
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.UNSUPPORTED_ARTIFACT;
    readonly artifact: SpecContextUnsupportedArtifact;
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

function unsafeCliDiagnosticCodes(): readonly number[] {
  return [
    ...Array.from({ length: CONTROL_CHAR_UPPER_BOUND + 1 }, (_unused, code) => code),
    DEL_CHAR_CODE,
  ];
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

/** The complete accepted-target domain: every declared class in every admitted spelling. */
export function specContextAcceptedTargetCases(): readonly SpecContextAcceptedTargetCase[] {
  return Object.values(SPEC_CONTEXT_TARGET_CLASS_VALUES).flatMap((targetClass) =>
    Object.values(SPEC_CONTEXT_TARGET_SPELLING_VALUES).map((spelling) => ({
      targetClass,
      spelling,
      title: `maps a ${spelling} ${targetClass} operand to its canonical target`,
    }))
  );
}

/**
 * The operand one accepted case supplies and the identity it must resolve to.
 * The canonical path of each class is the construction law: a product spec, a
 * node spec, and a decision all identify their containing node or the product
 * root, and every spelling is a mechanical re-spelling of that canonical path.
 */
export function specContextAcceptedTargetOperand(
  fixture: RepresentativeSpecTreeFixture,
  productDir: string,
  mappingCase: SpecContextAcceptedTargetCase,
): SpecContextAcceptedTargetOperand {
  const documents = specContextFixtureDocuments(fixture);
  const rootDecisionKind = DECISION_KINDS[0];
  const rootDecisionPath = specContextRootDecisionPath(fixture, rootDecisionKind);
  const canonicalByClass: Record<SpecContextTargetClass, { readonly path: string; readonly target: string }> = {
    [SPEC_CONTEXT_TARGET_CLASS_VALUES.PRODUCT_ROOT]: {
      path: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
      target: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    },
    [SPEC_CONTEXT_TARGET_CLASS_VALUES.PRODUCT_SPEC]: {
      path: documents.productSpecPath,
      target: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    },
    [SPEC_CONTEXT_TARGET_CLASS_VALUES.NODE_DIRECTORY]: {
      path: documents.childTargetPath,
      target: documents.childTargetPath,
    },
    [SPEC_CONTEXT_TARGET_CLASS_VALUES.NODE_SPEC]: { path: documents.childSpecPath, target: documents.childTargetPath },
    [SPEC_CONTEXT_TARGET_CLASS_VALUES.NODE_DECISION]: {
      path: documents.nodeDecisionPath,
      target: documents.rootTargetPath,
    },
    [SPEC_CONTEXT_TARGET_CLASS_VALUES.ROOT_DECISION]: {
      path: rootDecisionPath,
      target: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    },
  };
  const canonical = canonicalByClass[mappingCase.targetClass];
  const artifacts = mappingCase.targetClass === SPEC_CONTEXT_TARGET_CLASS_VALUES.ROOT_DECISION
    ? [{ path: rootDecisionPath, content: specContent("Root decision", SPEC_CONTEXT_DOCUMENT_OPENING.DECISION) }]
    : [];
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
    ...Object.values(SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_VALUES).map((artifact) => ({
      kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.UNSUPPORTED_ARTIFACT,
      artifact,
      title: `maps a ${artifact} artifact operand to the unsupported-artifact failure`,
    })),
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
  readonly operand: string;
} {
  const documents = specContextFixtureDocuments(fixture);
  const nestedTargetPath = rooted(documents.peerDirectory, documents.rootDirectory);
  return {
    nestedTargetPath,
    nestedSpecPath: `${nestedTargetPath}/${fixture.root.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
    operand: documents.rootDirectory,
  };
}

/**
 * A top-level directory whose name extends the fixture root's by one more
 * segment, so the root's directory name is a suffix of a longer path
 * component but never a complete one.
 */
export function specContextExtendedRootDirectory(fixture: RepresentativeSpecTreeFixture): {
  readonly operand: string;
  readonly extendedSpecPath: string;
} {
  const documents = specContextFixtureDocuments(fixture);
  const extendedDirectory = `${documents.rootDirectory}-${fixture.child.slug}`;
  return {
    operand: documents.rootDirectory,
    extendedSpecPath: `${rooted(extendedDirectory)}/${fixture.root.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
  };
}

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
      switch (mappingCase.artifact) {
        case SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_VALUES.ROOT_PLAN: {
          const path = rooted(SPEC_TREE_GRAMMAR.COORDINATION_NOTES[0]);
          return { ...none, operand: path, artifacts: [{ path, content: "# Plan\n" }] };
        }
        case SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_VALUES.TEST_EVIDENCE: {
          const filename = [
            fixture.root.slug,
            SPEC_TREE_GRAMMAR.EVIDENCE.MODES[0],
            SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS[0],
            ...SPEC_TREE_GRAMMAR.EVIDENCE.TAILS.TYPESCRIPT,
          ].join(SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR);
          const path = rooted(documents.rootDirectory, mappingCase.artifact, filename);
          return { ...none, operand: path, artifacts: [{ path, content: "" }] };
        }
        case SPEC_CONTEXT_UNSUPPORTED_ARTIFACT_VALUES.EVAL_EVIDENCE: {
          const path = rooted(
            documents.rootDirectory,
            mappingCase.artifact,
            fixture.decision.slug,
            SPEC_TREE_GRAMMAR.EVAL.FILES[0],
          );
          return { ...none, operand: path, artifacts: [{ path, content: "" }] };
        }
        default: {
          const path = rooted(documents.rootDirectory, mappingCase.artifact);
          return { ...none, operand: path, artifacts: [{ path, content: "" }] };
        }
      }
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
      }
    }
    // falls through: every unresolved shape returned above
    case SPEC_CONTEXT_TARGET_FAILURE_KIND.OUTSIDE_PRODUCT: {
      switch (mappingCase.shape) {
        case SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES.ABSOLUTE_OUTSIDE:
          return { ...none, operand: outsideDir };
        case SPEC_CONTEXT_OUTSIDE_SHAPE_VALUES.TRAVERSAL:
          return { ...none, operand: `..${TRACKED_PATH_DIRECTORY_SEPARATOR}${documents.rootDirectory}` };
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
  return unsafeCliDiagnosticCodes().flatMap((code) => {
    const escape = formatHexEscape(code);
    const unsafeValue = String.fromCodePoint(code);
    return Object.values(SPEC_CONTEXT_TARGET_FAILURE_KIND).map((kind) => ({
      failure: {
        kind,
        input: unsafeValue,
        candidates: kind === SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS ? [unsafeValue] : [],
      },
      title: `escapes ${escape} in ${kind} diagnostics`,
      unsafeValue,
    }));
  });
}

/** One extra node directory and one extra decision file, for a context projection run twice over the same tree. */
export type GeneratedContextDeterminismCase = {
  readonly extraDecision: SpecTreeFixtureEntry;
  readonly extraNode: SpecTreeFixtureEntry;
};

function withOpening(entry: SpecTreeFixtureEntry, opening: string): SpecTreeFixtureEntry {
  return { ...entry, contents: `${entry.contents}\n${opening} ${entry.path}\n` };
}

/** Every generated document carries the opening its Digest projection selects, so both projections render it. */
export function arbitraryContextDeterminismCase(config: Config): fc.Arbitrary<GeneratedContextDeterminismCase> {
  return fc.record({
    extraDecision: arbitraryDecisionEntry(config).map((entry) =>
      withOpening(entry, SPEC_CONTEXT_DOCUMENT_OPENING.DECISION)
    ),
    extraNode: arbitraryNodeEntry(config).map((entry) => {
      const opening = KIND_REGISTRY[entry.kind as keyof typeof KIND_REGISTRY];
      return withOpening(entry, "opening" in opening ? opening.opening : SPEC_CONTEXT_DOCUMENT_OPENING.DECISION);
    }),
  });
}

/** One subset of the invocation markers and the coding agent the declared precedence selects for it. */
export type SpecContextCodingAgentMarkerCase = {
  readonly markers: Readonly<Record<string, string>>;
  readonly expected: MethodologyCodingAgent | undefined;
  readonly title: string;
};

/**
 * The complete subset domain over the source-owned invocation marker keys,
 * with the spec's precedence law as the expectation: a Codex marker selects
 * Codex before any Claude Code marker, either Claude Code marker alone selects
 * Claude Code, and no marker selects no agent.
 */
export function specContextCodingAgentMarkerCases(marker: string): readonly SpecContextCodingAgentMarkerCase[] {
  const codexKeys = [HOOK_SESSION_START_ENV.CODEX_THREAD_ID] as const;
  const claudeKeys = [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE] as const;
  const keys = [...codexKeys, ...claudeKeys];
  return Array.from({ length: 2 ** keys.length }, (_unused, mask) => {
    const present = keys.filter((_key, index) => (mask & (1 << index)) !== 0);
    const expected = present.some((key) => codexKeys.includes(key as (typeof codexKeys)[number]))
      ? METHODOLOGY_CODING_AGENT.CODEX
      : present.some((key) => claudeKeys.includes(key as (typeof claudeKeys)[number]))
      ? METHODOLOGY_CODING_AGENT.CLAUDE
      : undefined;
    return {
      markers: Object.fromEntries(present.map((key) => [key, marker])),
      expected,
      title: `maps markers {${present.join(", ")}} to ${expected ?? "no agent"}`,
    };
  });
}
