import * as fc from "fast-check";

import type { Config } from "@/config/types";
import {
  DECISION_KINDS,
  DECISION_SUFFIXES,
  type Kind,
  KIND_REGISTRY,
  NODE_KINDS,
  NODE_SUFFIXES,
  OUTPUT_KINDS,
  OUTPUT_SUFFIXES,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_METHODOLOGY_LINE,
  type SpecTreeFilesystemRecordType,
  type SpecTreeKindCategory,
} from "@/lib/spec-tree";
import {
  sampleSpecTreeTestValue,
  singleSegmentOrder,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

export type FilenameGrammarTokenCase = {
  readonly name: string;
  readonly size: number;
};

export type KindRegistryMappingCase = {
  readonly title: string;
  readonly kind: Kind;
  readonly suffixPattern: RegExp;
};

export type KindRegistrySubsetCase = {
  readonly title: string;
  readonly category: SpecTreeKindCategory;
  readonly projectedKinds: readonly Kind[];
  readonly projectedSuffixes: readonly string[];
  readonly exportedKinds: readonly Kind[];
  readonly exportedSuffixes: readonly string[];
};

export type KindRegistrySuffixCase = {
  readonly title: string;
  readonly kinds: readonly Kind[];
};

export type SpecTreeKindsFieldCase = {
  readonly title: string;
  readonly config: Config;
};

export type SpecTreeEntryRecognitionCase = {
  readonly title: string;
  readonly kind: Kind;
  readonly orderSegments: readonly number[];
  readonly slug: string;
  readonly parentId?: string;
  readonly recordType: SpecTreeFilesystemRecordType;
  readonly relativePath: string;
};

/** One recognizable record: a node directory or a decision file, addressed as the recognizer receives it. */
export type OrderedRecordInput = {
  readonly type: SpecTreeFilesystemRecordType;
  readonly relativePath: string;
  readonly parentId?: string;
};

/** Two records of one kind whose indexes differ in how a later segment orders, under one methodology line. */
export type SegmentOrderRecognitionCase = {
  readonly title: string;
  readonly line: string;
  readonly lowerIndex: string;
  readonly higherIndex: string;
  readonly lower: OrderedRecordInput;
  readonly higher: OrderedRecordInput;
};

export type EvidenceRecognitionCase = {
  readonly parentId: string;
  readonly relativePath: string;
};

export const FILENAME_GRAMMAR_TOKEN_CASES = [
  { name: "product suffix", size: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX.length },
  { name: "evidence directory", size: SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME.length },
  { name: "evidence modes", size: SPEC_TREE_GRAMMAR.EVIDENCE.MODES.length },
  { name: "execution levels", size: SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS.length },
  { name: "language tails", size: Object.keys(SPEC_TREE_GRAMMAR.EVIDENCE.TAILS).length },
  { name: "evidence segment separator", size: SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR.length },
  { name: "runner tokens", size: SPEC_TREE_GRAMMAR.RUNNERS.length },
  { name: "order separator", size: SPEC_TREE_GRAMMAR.ORDER.SEPARATOR.length },
  { name: "order pattern", size: SPEC_TREE_GRAMMAR.ORDER_FORMS.DIGIT_RUNS.PATTERN.source.length },
  { name: "path separator", size: SPEC_TREE_GRAMMAR.PATH_SEPARATOR.length },
  { name: "coordination notes", size: SPEC_TREE_GRAMMAR.COORDINATION_NOTES.length },
  { name: "eval directory", size: SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME.length },
  { name: "eval files", size: SPEC_TREE_GRAMMAR.EVAL.FILES.length },
  { name: "eval runs directory", size: SPEC_TREE_GRAMMAR.EVAL.RUNS_DIRECTORY_NAME.length },
  { name: "canonical spec suffix", size: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX.length },
  { name: "prior spec suffix", size: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX.length },
  { name: "prior node suffixes", size: SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES.length },
] as const satisfies readonly FilenameGrammarTokenCase[];

const NODE_SUFFIX_SHAPE = /^\.[a-z-]+$/;
const DECISION_SUFFIX_SHAPE = /^\.[a-z-]+\.md$/;

const EXPORTED_KINDS_BY_CATEGORY: Readonly<Record<SpecTreeKindCategory, readonly Kind[]>> = {
  [SPEC_TREE_KIND_CATEGORY.NODE]: NODE_KINDS,
  [SPEC_TREE_KIND_CATEGORY.OUTPUT]: OUTPUT_KINDS,
  [SPEC_TREE_KIND_CATEGORY.DECISION]: DECISION_KINDS,
};

const EXPORTED_SUFFIXES_BY_CATEGORY: Readonly<Record<SpecTreeKindCategory, readonly string[]>> = {
  [SPEC_TREE_KIND_CATEGORY.NODE]: NODE_SUFFIXES,
  [SPEC_TREE_KIND_CATEGORY.OUTPUT]: OUTPUT_SUFFIXES,
  [SPEC_TREE_KIND_CATEGORY.DECISION]: DECISION_SUFFIXES,
};

export function kindRegistryMappingCases(): readonly KindRegistryMappingCase[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind) => ({
    title: `maps ${kind} to one category and suffix`,
    kind,
    suffixPattern: KIND_REGISTRY[kind].category === SPEC_TREE_KIND_CATEGORY.DECISION
      ? DECISION_SUFFIX_SHAPE
      : NODE_SUFFIX_SHAPE,
  }));
}

export function kindRegistrySubsetCases(): readonly KindRegistrySubsetCase[] {
  return [SPEC_TREE_KIND_CATEGORY.NODE, SPEC_TREE_KIND_CATEGORY.OUTPUT, SPEC_TREE_KIND_CATEGORY.DECISION].map(
    (category) => {
      const projectedKinds = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
        (kind) => KIND_REGISTRY[kind].category === category,
      );
      return {
        title: `projects the ${category} registry subset`,
        category,
        projectedKinds,
        projectedSuffixes: projectedKinds.map((kind) => KIND_REGISTRY[kind].suffix),
        exportedKinds: EXPORTED_KINDS_BY_CATEGORY[category],
        exportedSuffixes: EXPORTED_SUFFIXES_BY_CATEGORY[category],
      };
    },
  );
}

/**
 * The kinds the grammar declares: the 3.x `enabler` and `outcome` node kinds, the 4.0 `substrate`,
 * `capability`, `domain`, `interface`, `surface`, and `variant` output kinds, and the `adr` and
 * `pdr` decision kinds. The record is exhaustive over `Kind`, so a kind added to the registry
 * without a declaration here fails the type check, and the declarations name no registry field.
 */
const DECLARED_KINDS: Readonly<Record<Kind, true>> = {
  enabler: true,
  outcome: true,
  substrate: true,
  capability: true,
  domain: true,
  interface: true,
  surface: true,
  variant: true,
  adr: true,
  pdr: true,
};

/** Every kind the grammar declares. */
export function declaredKinds(): readonly Kind[] {
  return Object.keys(DECLARED_KINDS) as Kind[];
}

export function kindRegistrySuffixCases(): readonly KindRegistrySuffixCase[] {
  return [
    { title: "keeps node suffixes unique", kinds: NODE_KINDS },
    { title: "keeps decision suffixes unique", kinds: DECISION_KINDS },
    { title: "keeps all registered suffixes unique", kinds: Object.keys(KIND_REGISTRY) as Kind[] },
  ];
}

/** A configuration that carries no `specTree` section, so the descriptor defaults apply. */
export function specTreeAbsentSectionConfig(): Config {
  return {};
}

/** One configuration per accepted shape of a `kinds` field: a list of kind names and a map of kind definitions. */
export function specTreeKindsFieldCases(): readonly SpecTreeKindsFieldCase[] {
  const kindNames = [requireFirst(NODE_KINDS), requireFirst(DECISION_KINDS)];
  return [
    {
      title: "rejects a kinds field listing registered kind names",
      config: { [SPEC_TREE_CONFIG.SECTION]: { [SPEC_TREE_CONFIG_FIELDS.KINDS]: kindNames } },
    },
    {
      title: "rejects a kinds field mapping registered kind names to their definitions",
      config: { [SPEC_TREE_CONFIG.SECTION]: { [SPEC_TREE_CONFIG_FIELDS.KINDS]: { ...KIND_REGISTRY } } },
    },
  ];
}

export function specTreeEntryRecognitionCases(): readonly SpecTreeEntryRecognitionCase[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind) => {
    const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), 0);
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 1);
    const definition = KIND_REGISTRY[kind];
    if (definition.category !== SPEC_TREE_KIND_CATEGORY.DECISION) {
      return {
        title: `maps the registered ${kind} directory suffix`,
        kind,
        orderSegments: singleSegmentOrder(order),
        slug,
        recordType: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
        relativePath: `${order}-${slug}${definition.suffix}`,
      };
    }
    const parentOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), 2);
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 3);
    const parentId = `${parentOrder}-${parentSlug}${KIND_REGISTRY[requireFirst(NODE_KINDS)].suffix}`;
    return {
      title: `maps the registered ${kind} filename suffix`,
      kind,
      orderSegments: singleSegmentOrder(order),
      slug,
      parentId,
      recordType: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: `${parentId}/${order}-${slug}${definition.suffix}`,
    };
  });
}

const INDEX_SEGMENT_SEPARATOR = SPEC_TREE_GRAMMAR.ORDER.SEGMENT_SEPARATOR;

/** Under the 3.x version an index segment is a run of digits of any length: 9 precedes 10 numerically. */
const THREE_X_LOWER_SEGMENTS = ["2", "9"] as const;
const THREE_X_HIGHER_SEGMENTS = ["2", "10"] as const;

/** Under the 4.0 version fractional segments are two digits: a longer index extends a shorter one. */
const FOUR_ZERO_LOWER_SEGMENTS = ["20", "10"] as const;
const FOUR_ZERO_HIGHER_SEGMENTS = ["20", "10", "05"] as const;

interface SegmentOrderScope {
  readonly line: string;
  readonly nodeSuffix: string;
  readonly decisionSuffix: string;
  readonly lowerSegments: readonly string[];
  readonly higherSegments: readonly string[];
}

const SEGMENT_ORDER_SCOPES: readonly SegmentOrderScope[] = [
  {
    line: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
    nodeSuffix: KIND_REGISTRY.enabler.suffix,
    decisionSuffix: KIND_REGISTRY.adr.suffix,
    lowerSegments: THREE_X_LOWER_SEGMENTS,
    higherSegments: THREE_X_HIGHER_SEGMENTS,
  },
  {
    line: SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
    nodeSuffix: KIND_REGISTRY.capability.suffix,
    decisionSuffix: KIND_REGISTRY.pdr.suffix,
    lowerSegments: FOUR_ZERO_LOWER_SEGMENTS,
    higherSegments: FOUR_ZERO_HIGHER_SEGMENTS,
  },
];

/**
 * Per methodology line, a node directory pair and a decision file pair whose indexes order only by
 * comparing segments numerically; the node and decision suffixes come from `KIND_REGISTRY`.
 */
export function segmentOrderRecognitionCases(): readonly SegmentOrderRecognitionCase[] {
  return SEGMENT_ORDER_SCOPES.flatMap((scope) => {
    const lowerIndex = scope.lowerSegments.join(INDEX_SEGMENT_SEPARATOR);
    const higherIndex = scope.higherSegments.join(INDEX_SEGMENT_SEPARATOR);
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 4);
    const parentOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), 5);
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 6);
    const parentId = `${parentOrder}-${parentSlug}${scope.nodeSuffix}`;
    const nodeRecord = (index: string): OrderedRecordInput => ({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
      relativePath: `${index}-${slug}${scope.nodeSuffix}`,
    });
    const decisionRecord = (index: string): OrderedRecordInput => ({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: `${parentId}/${index}-${slug}${scope.decisionSuffix}`,
      parentId,
    });
    return [
      {
        title: `${scope.line} ${scope.nodeSuffix} directories ${lowerIndex} and ${higherIndex}`,
        line: scope.line,
        lowerIndex,
        higherIndex,
        lower: nodeRecord(lowerIndex),
        higher: nodeRecord(higherIndex),
      },
      {
        title: `${scope.line} ${scope.decisionSuffix} files ${lowerIndex} and ${higherIndex}`,
        line: scope.line,
        lowerIndex,
        higherIndex,
        lower: decisionRecord(lowerIndex),
        higher: decisionRecord(higherIndex),
      },
    ];
  });
}

export function arbitraryEvidenceRecognitionCase(): fc.Arbitrary<EvidenceRecognitionCase> {
  return fc
    .record({
      kind: fc.constantFrom(...NODE_KINDS),
      order: SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      slug: SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      evidenceFileName: SPEC_TREE_TEST_GENERATOR.evidenceFileName(),
    })
    .map(({ kind, order, slug, evidenceFileName }) => {
      const parentId = `${order}-${slug}${KIND_REGISTRY[kind].suffix}`;
      return {
        parentId,
        relativePath: [parentId, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFileName].join(
          SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
        ),
      };
    });
}

export function productEntryRecognitionCase(): {
  readonly slug: string;
  readonly relativePath: string;
} {
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 7);
  return { slug, relativePath: `${slug}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}` };
}

function requireFirst<T>(values: readonly T[]): T {
  const first = values[0];
  if (first === undefined) throw new Error("Expected a non-empty source-owned registry projection");
  return first;
}
