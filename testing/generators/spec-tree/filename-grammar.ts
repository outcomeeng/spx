import * as fc from "fast-check";

import type { Config } from "@/config/types";
import {
  canonicalNamingSchemaVersion,
  DECISION_KINDS,
  DECISION_SUFFIXES,
  type Kind,
  KIND_REGISTRY,
  type NamingSchemaVersion,
  NODE_KINDS,
  NODE_SUFFIXES,
  OUTPUT_KINDS,
  OUTPUT_SUFFIXES,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_METHODOLOGY_LINE,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
  type SpecTreeEntryType,
  type SpecTreeFilesystemRecordType,
  type SpecTreeMethodologyLine,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  DECLARED_KIND_CATEGORY,
  DECLARED_KIND_FORMS,
  DECLARED_PRODUCT_KIND,
  DECLARED_PRODUCT_NODE_SUFFIX,
  type DeclaredKindCategory,
  declaredKinds,
  declaredKindsOfCategory,
  declaredSuffixesOfCategory,
} from "@testing/generators/spec-tree/declared-kinds";
import {
  FOUR_ZERO_INDEX_GENERATOR,
  fourZeroFormExpectation,
  THREE_X_INDEX_GENERATOR,
  threeXFormExpectation,
} from "@testing/generators/spec-tree/naming-schema-form";
import {
  orderedDirectoryRecord,
  semverMaximumOracle,
  semverOrderOracle,
} from "@testing/generators/spec-tree/naming-schema-version";
import {
  sampleSpecTreeTestValue,
  SPEC_TREE_SOURCE_LINES,
  SPEC_TREE_TEST_GENERATOR,
  specTreeGrammarSelectionForLine,
  supersededSuffixOracle,
} from "@testing/generators/spec-tree/spec-tree";

export type FilenameGrammarTokenCase = {
  readonly name: string;
  readonly actual: unknown;
  readonly expected: unknown;
};

export type KindRegistryMappingCase = {
  readonly title: string;
  readonly kind: Kind;
  readonly category: DeclaredKindCategory;
  readonly suffix: string;
};

/** The exported kind lists one declared kind belongs to, by its declared category. */
export type KindPartitionCase = {
  readonly kind: Kind;
  readonly inNodeKinds: boolean;
  readonly inOutputKinds: boolean;
  readonly inDecisionKinds: boolean;
};

export type KindRegistrySubsetCase = {
  readonly title: string;
  readonly category: DeclaredKindCategory;
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

/** A node directory a declaration on `line` selects a naming-schema version to accept, with the entry it maps to. */
export type NodeDirectoryRecognitionCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly kind: string;
  readonly orderSegments: readonly number[];
  readonly slug: string;
  readonly relativePath: string;
};

/** A decision file a declaration on `line` selects a naming-schema version to accept, with the entry it maps to. */
export type DecisionFileRecognitionCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly kind: Kind;
  readonly orderSegments: readonly number[];
  readonly slug: string;
  readonly parentId: string;
  readonly relativePath: string;
};

/** A product-root file a declaration on `line` selects a naming-schema version to accept. */
export type ProductRootRecognitionCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly slug: string;
  readonly relativePath: string;
  /** The kind the root spec declares in its front matter; absent for a root named by its file suffix alone. */
  readonly declaredKind?: string;
};

/** One recognizable record, addressed as the recognizer receives it. */
export type OrderedRecordInput = {
  readonly type: SpecTreeFilesystemRecordType;
  readonly relativePath: string;
  readonly parentId?: string;
  readonly declaredKind?: string;
};

/** Two records of one kind whose indexes are drawn from a methodology line's index form. */
export type SegmentOrderRecognitionCase = {
  readonly title: string;
  readonly line: string;
  readonly firstIndex: string;
  readonly secondIndex: string;
  readonly first: OrderedRecordInput;
  readonly second: OrderedRecordInput;
};

export type EvidenceRecognitionCase = {
  readonly line: SpecTreeMethodologyLine;
  readonly parentId: string;
  readonly relativePath: string;
};

/** A record valid under the declaration on `line`, with the entry type and kind its form maps to. */
export type ValidRecognitionScenario = {
  readonly line: SpecTreeMethodologyLine;
  readonly record: OrderedRecordInput;
  /** The fields of the entry the form maps to: its type, and its kind for a node or decision form. */
  readonly expected: { readonly type: SpecTreeEntryType; readonly kind?: string };
};

/** An ordered node directory only a naming-schema version ordered before the declared target's accepts. */
export type SupersededLineScenario = {
  readonly line: SpecTreeMethodologyLine;
  readonly record: OrderedRecordInput;
  /** The newest version the independent oracle names for the directory's suffix. */
  readonly expectedVersion: string;
};

/** The files the methodology states under a node's `evals/{rule-slug}/` directory. */
const DECLARED_EVAL_FILES = ["eval.toml", "cases.jsonl", "prompt.md", "prompt.template.md", "history.jsonl"] as const;

/** The evidence-file segments the methodology states under a node's `tests/` directory, with the runner tokens. */
const DECLARED_EVIDENCE_FILE_GRAMMAR = {
  evidence: {
    DIRECTORY_NAME: "tests",
    MODES: ["scenario", "mapping", "conformance", "property", "compliance"],
    LEVELS: ["l1", "l2", "l3"],
    TAILS: { TYPESCRIPT: ["test", "ts"], PYTHON: ["py"], RUST: ["rs"] },
    SEGMENT_SEPARATOR: ".",
  },
  runners: ["vitest", "playwright", "subprocess"],
} as const;

/** The naming-schema version that precedes every other under semantic-version ordering. */
function firstNamingSchemaVersion(): NamingSchemaVersion {
  return [...SPEC_TREE_NAMING_SCHEMA_VERSIONS].sort((left, right) => semverOrderOracle(left.version, right.version))[0];
}

/**
 * One case per grammar token group, each paired with the value the methodology states for it: the
 * product and spec-file suffixes, the kind suffixes the spec declares, the evidence modes, levels,
 * and language tails, the runner tokens, the separators, the coordination-note names, and the
 * eval-lane names. The expected values are the methodology's own literals, never a field the
 * library resolves them through.
 */
export const FILENAME_GRAMMAR_TOKEN_CASES: readonly FilenameGrammarTokenCase[] = [
  { name: "product suffix", actual: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX, expected: ".product.md" },
  {
    name: "kind suffixes",
    actual: [...NODE_SUFFIXES, ...OUTPUT_SUFFIXES, ...DECISION_SUFFIXES].sort(compareAsciiStrings),
    expected: declaredKinds().map((kind) => DECLARED_KIND_FORMS[kind].suffix).sort(compareAsciiStrings),
  },
  { name: "evidence directory", actual: SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME, expected: "tests" },
  {
    name: "evidence modes",
    actual: SPEC_TREE_GRAMMAR.EVIDENCE.MODES,
    expected: ["scenario", "mapping", "conformance", "property", "compliance"],
  },
  { name: "execution levels", actual: SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS, expected: ["l1", "l2", "l3"] },
  {
    name: "language tails",
    actual: SPEC_TREE_GRAMMAR.EVIDENCE.TAILS,
    expected: { TYPESCRIPT: ["test", "ts"], PYTHON: ["py"], RUST: ["rs"] },
  },
  { name: "evidence segment separator", actual: SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR, expected: "." },
  { name: "runner tokens", actual: SPEC_TREE_GRAMMAR.RUNNERS, expected: ["vitest", "playwright", "subprocess"] },
  { name: "order separator", actual: SPEC_TREE_GRAMMAR.ORDER.SEPARATOR, expected: "-" },
  {
    name: "order pattern",
    actual: SPEC_TREE_GRAMMAR.ORDER_FORMS.DIGIT_RUNS.PATTERN.source,
    expected: String.raw`^\d+(\.\d+)*$`,
  },
  { name: "path separator", actual: SPEC_TREE_GRAMMAR.PATH_SEPARATOR, expected: "/" },
  { name: "coordination notes", actual: SPEC_TREE_GRAMMAR.COORDINATION_NOTES, expected: ["PLAN.md", "ISSUES.md"] },
  { name: "eval directory", actual: SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME, expected: "evals" },
  {
    name: "eval files",
    actual: SPEC_TREE_GRAMMAR.EVAL.FILES,
    expected: DECLARED_EVAL_FILES,
  },
  {
    name: "eval files of the 4.0 and 3.x naming-schema versions",
    actual: [
      SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.eval.FILES,
      canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).eval.FILES,
    ],
    expected: [DECLARED_EVAL_FILES, DECLARED_EVAL_FILES],
  },
  {
    name: "evidence file grammar of the 4.0 and 3.x naming-schema versions",
    actual: [
      SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
      canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS),
    ].map((version) => ({ evidence: version.evidence, runners: version.runners })),
    expected: [DECLARED_EVIDENCE_FILE_GRAMMAR, DECLARED_EVIDENCE_FILE_GRAMMAR],
  },
  {
    name: "node suffixes of the first naming-schema version",
    actual: [...firstNamingSchemaVersion().nodeSuffixes].sort(compareAsciiStrings),
    expected: [".capability", ".feature", ".story"],
  },
  { name: "eval runs directory", actual: SPEC_TREE_GRAMMAR.EVAL.RUNS_DIRECTORY_NAME, expected: "runs" },
  { name: "canonical spec suffix", actual: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX, expected: ".spec.md" },
  { name: "prior spec suffix", actual: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX, expected: ".md" },
  { name: "prior node suffixes", actual: SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES, expected: [".feature", ".story"] },
];

const EXPORTED_KINDS_BY_CATEGORY: Readonly<Record<DeclaredKindCategory, readonly Kind[]>> = {
  [DECLARED_KIND_CATEGORY.NODE]: NODE_KINDS,
  [DECLARED_KIND_CATEGORY.OUTPUT]: OUTPUT_KINDS,
  [DECLARED_KIND_CATEGORY.DECISION]: DECISION_KINDS,
};

const EXPORTED_SUFFIXES_BY_CATEGORY: Readonly<Record<DeclaredKindCategory, readonly string[]>> = {
  [DECLARED_KIND_CATEGORY.NODE]: NODE_SUFFIXES,
  [DECLARED_KIND_CATEGORY.OUTPUT]: OUTPUT_SUFFIXES,
  [DECLARED_KIND_CATEGORY.DECISION]: DECISION_SUFFIXES,
};

const DECLARED_CATEGORIES: readonly DeclaredKindCategory[] = Object.values(DECLARED_KIND_CATEGORY);

/** One case per declared kind, with the category and suffix the spec declares for it. */
export function kindRegistryMappingCases(): readonly KindRegistryMappingCase[] {
  return declaredKinds().map((kind) => ({
    title: `maps ${kind} to one category and suffix`,
    kind,
    category: DECLARED_KIND_FORMS[kind].category,
    suffix: DECLARED_KIND_FORMS[kind].suffix,
  }));
}

/** One case per declared kind, with the exported kind lists it belongs to by its declared category. */
export function kindPartitionCases(): readonly KindPartitionCase[] {
  return declaredKinds().map((kind) => ({
    kind,
    inNodeKinds: DECLARED_KIND_FORMS[kind].category === DECLARED_KIND_CATEGORY.NODE,
    inOutputKinds: DECLARED_KIND_FORMS[kind].category === DECLARED_KIND_CATEGORY.OUTPUT,
    inDecisionKinds: DECLARED_KIND_FORMS[kind].category === DECLARED_KIND_CATEGORY.DECISION,
  }));
}

/** One case per declared category, pairing the declared kinds and suffixes with the exported sub-registries. */
export function kindRegistrySubsetCases(): readonly KindRegistrySubsetCase[] {
  return DECLARED_CATEGORIES.map((category) => ({
    title: `projects the ${category} registry subset`,
    category,
    projectedKinds: declaredKindsOfCategory(category),
    projectedSuffixes: declaredSuffixesOfCategory(category),
    exportedKinds: EXPORTED_KINDS_BY_CATEGORY[category],
    exportedSuffixes: EXPORTED_SUFFIXES_BY_CATEGORY[category],
  }));
}

export function kindRegistrySuffixCases(): readonly KindRegistrySuffixCase[] {
  return [
    { title: "keeps node suffixes unique", kinds: declaredKindsOfCategory(DECLARED_KIND_CATEGORY.NODE) },
    { title: "keeps decision suffixes unique", kinds: declaredKindsOfCategory(DECLARED_KIND_CATEGORY.DECISION) },
    { title: "keeps all registered suffixes unique", kinds: declaredKinds() },
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

type DeclaredNodeDirectoryKind = { readonly kind: string; readonly suffix: string };

/** The kind a node-directory suffix names: the nested product scope, or the registered node or output kind. */
function nodeKindForSuffix(suffix: string): string {
  if (suffix === SPEC_TREE_CONFIG.PRODUCT.NODE_SUFFIX) return SPEC_TREE_CONFIG.PRODUCT.KIND;
  const registered = (Object.keys(KIND_REGISTRY) as Kind[]).find((kind) =>
    KIND_REGISTRY[kind].suffix === suffix && KIND_REGISTRY[kind].category !== SPEC_TREE_KIND_CATEGORY.DECISION
  );
  if (registered === undefined) throw new Error(`No registered node kind carries the suffix ${suffix}`);
  return registered;
}

/** The node kinds the selected naming-schema versions of a methodology line accept, drawn from their node suffixes. */
function declaredNodeDirectoryKinds(line: SpecTreeMethodologyLine): readonly DeclaredNodeDirectoryKind[] {
  const suffixes = new Set(specTreeGrammarSelectionForLine(line).selected.flatMap((version) => version.nodeSuffixes));
  return [...suffixes].map((suffix) => ({ kind: nodeKindForSuffix(suffix), suffix }));
}

/** The index form of the naming-schema version a methodology line selects, as a generator over accepted indices. */
function arbitraryIndexTextForLine(line: SpecTreeMethodologyLine): fc.Arbitrary<string> {
  switch (line) {
    case SPEC_TREE_METHODOLOGY_LINE.THREE_TWO:
      return THREE_X_INDEX_GENERATOR.accepted();
    case SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO:
      return FOUR_ZERO_INDEX_GENERATOR.accepted();
    default:
      throw new Error(`No index form is stated for methodology line ${line}`);
  }
}

/** The numeric segments an index text names, read directly by splitting on the segment separator. */
function indexTextSegments(indexText: string): readonly number[] {
  return indexText.split(SPEC_TREE_GRAMMAR.ORDER.SEGMENT_SEPARATOR).map((segment) => Number.parseInt(segment, 10));
}

function indexedName(indexText: string, slug: string, suffix: string): string {
  return `${indexText}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`;
}

/** One node directory for every kind each methodology line's selected versions accept, the 4.0 `.product` scope included. */
export function nodeDirectoryRecognitionCases(): readonly NodeDirectoryRecognitionCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line) =>
    declaredNodeDirectoryKinds(line).map(({ kind, suffix }) => ({ line, kind, suffix }))
  )
    .map(({ line, kind, suffix }, drawIndex) => {
      const indexText = sampleSpecTreeTestValue(arbitraryIndexTextForLine(line), drawIndex);
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
      return {
        title: `maps the ${line} ${suffix} directory to the ${kind} kind`,
        line,
        kind,
        orderSegments: indexTextSegments(indexText),
        slug,
        relativePath: indexedName(indexText, slug, suffix),
      };
    });
}

/** One decision file for every registered decision kind under each methodology line, held by a node directory of that line. */
export function decisionFileRecognitionCases(): readonly DecisionFileRecognitionCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line) => DECISION_KINDS.map((kind) => ({ line, kind })))
    .map(({ line, kind }, drawIndex) => {
      const indexText = sampleSpecTreeTestValue(arbitraryIndexTextForLine(line), drawIndex);
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
      const parentOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), drawIndex + 1);
      const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex + 1);
      const parentId = orderedDirectoryRecord(
        parentOrder,
        parentSlug,
        requireFirst(declaredNodeDirectoryKinds(line)).suffix,
      ).relativePath;
      return {
        title: `maps the ${line} ${KIND_REGISTRY[kind].suffix} file to the ${kind} kind`,
        line,
        kind,
        orderSegments: indexTextSegments(indexText),
        slug,
        parentId,
        relativePath: [parentId, indexedName(indexText, slug, KIND_REGISTRY[kind].suffix)].join(
          SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
        ),
      };
    });
}

/**
 * The product-root name each methodology line's selected naming-schema versions declare: a `{name}.product.md`
 * file under 3.2, and a `{name}.spec.md` file whose front matter declares the product kind under 4.0.
 */
export function productRootRecognitionCases(): readonly ProductRootRecognitionCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line) =>
    specTreeGrammarSelectionForLine(line).selected.map((version) => ({ line, version }))
  ).map(({ line, version }, drawIndex) => {
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
    return {
      title: `maps a ${line} ${version.productSuffix} root${
        version.rootSpecKind === undefined ? "" : ` declaring the ${version.rootSpecKind} kind`
      } to the product`,
      line,
      slug,
      relativePath: `${slug}${version.productSuffix}`,
      declaredKind: version.rootSpecKind,
    };
  });
}

/** One record a naming-schema version accepts by the spec's statement, with the entry the recognizer is expected to return. */
export type SpecFileFormCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly record: {
    readonly type: SpecTreeFilesystemRecordType;
    readonly relativePath: string;
    readonly parentId?: string;
    readonly declaredKind?: string;
  };
  readonly expected: Readonly<Record<string, unknown>>;
};

type DeclaredNodeForm = { readonly kind: string; readonly suffix: string };

function declaredNodeForms(category: DeclaredKindCategory): readonly DeclaredNodeForm[] {
  return declaredKindsOfCategory(category).map((kind) => ({ kind, suffix: DECLARED_KIND_FORMS[kind].suffix }));
}

/**
 * Per methodology line, one record for every form the line's naming-schema version accepts by the spec's
 * statement: each declared node directory holding its `{slug}` spec file, the root spec file, and each
 * declared decision form. The kinds, suffixes, and spec-file forms are the spec's own declarations.
 */
export function specFileFormCases(): readonly SpecFileFormCase[] {
  const lines = [
    {
      line: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
      form: threeXFormExpectation(),
      nodes: declaredNodeForms(DECLARED_KIND_CATEGORY.NODE),
      index: THREE_X_INDEX_GENERATOR.accepted,
    },
    {
      line: SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
      form: fourZeroFormExpectation(),
      nodes: [...declaredNodeForms(DECLARED_KIND_CATEGORY.OUTPUT), {
        kind: DECLARED_PRODUCT_KIND,
        suffix: DECLARED_PRODUCT_NODE_SUFFIX,
      }],
      index: FOUR_ZERO_INDEX_GENERATOR.accepted,
    },
  ];
  let draw = 0;
  const nextDraw = (): number => draw++;
  return lines.flatMap(({ line, form, nodes, index }) => {
    const nodeCases = nodes.map(({ kind, suffix }): SpecFileFormCase => {
      const drawIndex = nextDraw();
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
      const relativePath = indexedName(sampleSpecTreeTestValue(index(), drawIndex), slug, suffix);
      return {
        title: `${line} accepts the ${suffix} directory holding ${slug}${form.specFileSuffix}`,
        line,
        record: { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath },
        expected: {
          type: SPEC_TREE_ENTRY_TYPE.NODE,
          kind,
          slug,
          ref: {
            path: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath, `${slug}${form.specFileSuffix}`].join(
              SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
            ),
          },
        },
      };
    });
    const rootDraw = nextDraw();
    const rootName = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), rootDraw);
    const rootCase: SpecFileFormCase = {
      title: `${line} accepts the ${form.rootSpecSuffix} root spec`,
      line,
      record: {
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
        relativePath: `${rootName}${form.rootSpecSuffix}`,
        declaredKind: form.rootSpecKind,
      },
      expected: { type: SPEC_TREE_ENTRY_TYPE.PRODUCT, title: rootName },
    };
    const parentDraw = nextDraw();
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), parentDraw);
    const parentId = indexedName(
      sampleSpecTreeTestValue(index(), parentDraw),
      parentSlug,
      requireFirst(nodes).suffix,
    );
    const decisionCases = declaredNodeForms(DECLARED_KIND_CATEGORY.DECISION).map(
      ({ kind, suffix }): SpecFileFormCase => {
        const drawIndex = nextDraw();
        const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
        return {
          title: `${line} accepts the ${suffix} decision form`,
          line,
          record: {
            type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
            relativePath: [parentId, indexedName(sampleSpecTreeTestValue(index(), drawIndex), slug, suffix)].join(
              SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
            ),
            parentId,
          },
          expected: { type: SPEC_TREE_ENTRY_TYPE.DECISION, kind, slug, parentId },
        };
      },
    );
    return [...nodeCases, rootCase, ...decisionCases];
  });
}

const FIRST_SEGMENT_POSITION = 0;

/** The shapes in which two indices relate: unrelated draws, a fractional insert below an index, and two inserts below one index. */
const SEGMENT_ORDER_SHAPES = [
  {
    name: "independent draws",
    indices: (first: string, second: string) => [first, second],
  },
  {
    name: "a fractional insert below its base",
    indices: (first: string, second: string) => [first, joinIndex(first, leadingSegment(second))],
  },
  {
    name: "fractional inserts below one base",
    indices: (first: string, second: string, third: string) => [
      joinIndex(first, leadingSegment(second)),
      joinIndex(first, leadingSegment(third)),
    ],
  },
] as const;

function leadingSegment(indexText: string): string {
  return indexText.split(SPEC_TREE_GRAMMAR.ORDER.SEGMENT_SEPARATOR)[FIRST_SEGMENT_POSITION];
}

function joinIndex(base: string, segment: string): string {
  return [base, segment].join(SPEC_TREE_GRAMMAR.ORDER.SEGMENT_SEPARATOR);
}

/**
 * Per methodology line, node directory pairs and decision file pairs whose indices are drawn from the
 * line's index form, including fractional inserts. The suffixes come from the line's selected
 * naming-schema versions and the decision kinds.
 */
export function segmentOrderRecognitionCases(): readonly SegmentOrderRecognitionCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line, lineIndex) => {
    const nodeSuffix = requireFirst(declaredNodeDirectoryKinds(line)).suffix;
    const decisionSuffix = KIND_REGISTRY[requireFirst(DECISION_KINDS)].suffix;
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 4 + lineIndex);
    const parentOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), 5 + lineIndex);
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 6 + lineIndex);
    const parentId = orderedDirectoryRecord(parentOrder, parentSlug, nodeSuffix).relativePath;
    const nodeRecord = (index: string): OrderedRecordInput => ({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
      relativePath: indexedName(index, slug, nodeSuffix),
    });
    const decisionRecord = (index: string): OrderedRecordInput => ({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: [parentId, indexedName(index, slug, decisionSuffix)].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
      parentId,
    });
    return SEGMENT_ORDER_SHAPES.flatMap((shape, shapeIndex) => {
      const drawBase = (lineIndex * SEGMENT_ORDER_SHAPES.length + shapeIndex) * 3;
      const [first, second, third] = [0, 1, 2].map((offset) =>
        sampleSpecTreeTestValue(arbitraryIndexTextForLine(line), drawBase + offset)
      );
      const [firstIndex, secondIndex] = shape.indices(first, second, third);
      return [
        {
          title: `${line} ${nodeSuffix} directories ${firstIndex} and ${secondIndex} (${shape.name})`,
          line,
          firstIndex,
          secondIndex,
          first: nodeRecord(firstIndex),
          second: nodeRecord(secondIndex),
        },
        {
          title: `${line} ${decisionSuffix} files ${firstIndex} and ${secondIndex} (${shape.name})`,
          line,
          firstIndex,
          secondIndex,
          first: decisionRecord(firstIndex),
          second: decisionRecord(secondIndex),
        },
      ];
    });
  });
}

export function arbitraryEvidenceRecognitionCase(): fc.Arbitrary<EvidenceRecognitionCase> {
  return fc
    .constantFrom(...SPEC_TREE_SOURCE_LINES)
    .chain((line) =>
      fc.record({
        line: fc.constant(line),
        parent: fc.constantFrom(...declaredNodeDirectoryKinds(line)),
        order: SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        slug: SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        evidenceFileName: SPEC_TREE_TEST_GENERATOR.evidenceFileName(),
      })
    )
    .map(({ line, parent, order, slug, evidenceFileName }) => {
      const parentId = orderedDirectoryRecord(order, slug, parent.suffix).relativePath;
      return {
        line,
        parentId,
        relativePath: [parentId, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFileName].join(
          SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
        ),
      };
    });
}

/**
 * A record valid under a methodology line, drawn across the node-directory, decision-file,
 * product-root, and evidence-file forms the line declares. The entry type and kind each form maps to
 * follow from how the form is constructed.
 */
export function arbitraryValidRecognitionScenario(): fc.Arbitrary<ValidRecognitionScenario> {
  const nodeScenario = (line: SpecTreeMethodologyLine): fc.Arbitrary<ValidRecognitionScenario> =>
    fc
      .tuple(
        fc.constantFrom(...declaredNodeDirectoryKinds(line)),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      )
      .map(([{ kind, suffix }, order, slug]) => ({
        line,
        record: orderedDirectoryRecord(order, slug, suffix),
        expected: { type: SPEC_TREE_ENTRY_TYPE.NODE, kind },
      }));
  const decisionScenario = (line: SpecTreeMethodologyLine): fc.Arbitrary<ValidRecognitionScenario> =>
    fc
      .tuple(
        fc.constantFrom(...DECISION_KINDS),
        fc.constantFrom(...declaredNodeDirectoryKinds(line)),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      )
      .map(([kind, parent, parentOrder, order, parentSlug, slug]) => {
        const parentId = orderedDirectoryRecord(parentOrder, parentSlug, parent.suffix).relativePath;
        return {
          line,
          record: {
            type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
            relativePath: [
              parentId,
              `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${KIND_REGISTRY[kind].suffix}`,
            ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
            parentId,
          },
          expected: { type: SPEC_TREE_ENTRY_TYPE.DECISION, kind },
        };
      });
  const productScenario = (line: SpecTreeMethodologyLine): fc.Arbitrary<ValidRecognitionScenario> =>
    fc.constantFrom(...productRootRecognitionCases().filter((root) => root.line === line)).chain((root) =>
      SPEC_TREE_TEST_GENERATOR.sourceSlug().map((slug) => ({
        line,
        record: {
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
          relativePath: `${slug}${root.relativePath.slice(root.slug.length)}`,
          declaredKind: root.declaredKind,
        },
        expected: { type: SPEC_TREE_ENTRY_TYPE.PRODUCT },
      }))
    );
  const evidenceScenario = (line: SpecTreeMethodologyLine): fc.Arbitrary<ValidRecognitionScenario> =>
    arbitraryEvidenceRecognitionCase()
      .filter((testCase) => testCase.line === line)
      .map((testCase) => ({
        line,
        record: {
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
          relativePath: testCase.relativePath,
          parentId: testCase.parentId,
        },
        expected: { type: SPEC_TREE_ENTRY_TYPE.EVIDENCE },
      }));
  return fc
    .constantFrom(...SPEC_TREE_SOURCE_LINES)
    .chain((line) =>
      fc.oneof(nodeScenario(line), decisionScenario(line), productScenario(line), evidenceScenario(line))
    );
}

/**
 * Independent oracle for the product-root suffixes a selection supersedes: every root suffix a known
 * version ordered before the declared target accepts with no declared root spec kind, that no selected
 * version accepts, paired with the newest such version. Ordering comes from the semantic-version oracle.
 */
function supersededProductRootOracle(
  line: SpecTreeMethodologyLine,
): readonly { readonly suffix: string; readonly version: string }[] {
  const selection = specTreeGrammarSelectionForLine(line);
  const target = semverMaximumOracle(selection.selected);
  const selectedSuffixes = new Set(selection.selected.map((version) => version.productSuffix));
  const priors = selection.known.filter((version) =>
    !selection.selected.includes(version)
    && semverOrderOracle(version.version, target.version) <= 0
    && version.rootSpecKind === undefined
  );
  return [...new Set(priors.map((version) => version.productSuffix))]
    .filter((suffix) => !selectedSuffixes.has(suffix))
    .map((suffix) => ({
      suffix,
      version: semverMaximumOracle(priors.filter((version) => version.productSuffix === suffix)).version,
    }));
}

/**
 * A node directory or a product-root file only a naming-schema version ordered before the line's
 * declared target accepts. The independent superseded oracles name the suffix and the newest version
 * that accepts it; a line whose selection leaves no root suffix behind presents node directories only.
 */
export function arbitrarySupersededLineScenario(): fc.Arbitrary<SupersededLineScenario> {
  return fc
    .constantFrom(...SPEC_TREE_SOURCE_LINES)
    .chain((line) => {
      const nodeScenario = fc.tuple(
        fc.constantFrom(...supersededSuffixOracle(specTreeGrammarSelectionForLine(line))),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      ).map(([{ suffix, version }, order, slug]): SupersededLineScenario => ({
        line,
        record: orderedDirectoryRecord(order, slug, suffix),
        expectedVersion: version,
      }));
      const rootOracle = supersededProductRootOracle(line);
      if (rootOracle.length === 0) return nodeScenario;
      const productScenario = fc.tuple(
        fc.constantFrom(...rootOracle),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      ).map(([{ suffix, version }, slug]): SupersededLineScenario => ({
        line,
        record: { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: `${slug}${suffix}` },
        expectedVersion: version,
      }));
      return fc.oneof(nodeScenario, productScenario);
    });
}

function requireFirst<T>(values: readonly T[]): T {
  const first = values[0];
  if (first === undefined) throw new Error("Expected a non-empty source-owned registry projection");
  return first;
}
