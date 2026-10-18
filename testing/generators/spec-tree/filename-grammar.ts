import * as fc from "fast-check";

import type { Config } from "@/config/types";
import {
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
  type SpecTreeEntryType,
  type SpecTreeFilesystemRecordType,
  type SpecTreeKindCategory,
  type SpecTreeMethodologyLine,
  type SpecTreeRecognitionOptions,
} from "@/lib/spec-tree";
import { FOUR_ZERO_INDEX_GENERATOR, THREE_X_INDEX_GENERATOR } from "@testing/generators/spec-tree/naming-schema-form";
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

type NodeForm = { readonly kind: string; readonly suffix: string };

/** The registered kinds of one category, read from the registry by their category alone. */
function registeredKindsOfCategory(category: SpecTreeKindCategory): readonly Kind[] {
  return (Object.keys(KIND_REGISTRY) as Kind[]).filter((kind) => KIND_REGISTRY[kind].category === category);
}

function registeredForms(category: SpecTreeKindCategory): readonly NodeForm[] {
  return registeredKindsOfCategory(category).map((kind) => ({ kind, suffix: KIND_REGISTRY[kind].suffix }));
}

/**
 * Per methodology line, one record for every form the line's naming-schema version accepts by the spec's
 * statement: a 3.x line accepts the `node` kinds as directories holding `{slug}.md` and a `{name}.product.md`
 * root, a 4.0 line accepts the `output` kinds and the nested product scope as directories holding
 * `{slug}.spec.md` and a `{name}.spec.md` root declaring the product kind, and both accept every `decision`
 * kind as a file. The kind each form maps to follows from the registered kind that supplies its suffix.
 */
export function specFileFormCases(): readonly SpecFileFormCase[] {
  const lines = [
    {
      line: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
      nodes: registeredForms(SPEC_TREE_KIND_CATEGORY.NODE),
      specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
      rootSpecSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
      rootSpecKind: undefined,
      index: THREE_X_INDEX_GENERATOR.accepted,
    },
    {
      line: SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
      nodes: [...registeredForms(SPEC_TREE_KIND_CATEGORY.OUTPUT), {
        kind: SPEC_TREE_CONFIG.PRODUCT.KIND,
        suffix: SPEC_TREE_CONFIG.PRODUCT.NODE_SUFFIX,
      }],
      specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
      rootSpecSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
      rootSpecKind: SPEC_TREE_CONFIG.PRODUCT.KIND,
      index: FOUR_ZERO_INDEX_GENERATOR.accepted,
    },
  ];
  let draw = 0;
  const nextDraw = (): number => draw++;
  return lines.flatMap(({ line, nodes, specFileSuffix, rootSpecSuffix, rootSpecKind, index }) => {
    const nodeCases = nodes.map(({ kind, suffix }): SpecFileFormCase => {
      const drawIndex = nextDraw();
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
      const relativePath = indexedName(sampleSpecTreeTestValue(index(), drawIndex), slug, suffix);
      return {
        title: `${line} accepts the ${suffix} directory holding ${slug}${specFileSuffix}`,
        line,
        record: { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath },
        expected: {
          type: SPEC_TREE_ENTRY_TYPE.NODE,
          kind,
          slug,
          ref: {
            path: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath, `${slug}${specFileSuffix}`].join(
              SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
            ),
          },
        },
      };
    });
    const rootName = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), nextDraw());
    const rootCase: SpecFileFormCase = {
      title: `${line} accepts the ${rootSpecSuffix} root spec`,
      line,
      record: {
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
        relativePath: `${rootName}${rootSpecSuffix}`,
        declaredKind: rootSpecKind,
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
    const decisionCases = registeredForms(SPEC_TREE_KIND_CATEGORY.DECISION).map(
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

/** One registered kind with the record its suffix names, the entry the kind's category maps it to, and the lines that category is read under. */
export type KindRecognitionCase = {
  readonly kind: Kind;
  readonly lines: readonly SpecTreeMethodologyLine[];
  readonly record: OrderedRecordInput;
  readonly expectedType: SpecTreeEntryType;
};

/**
 * One case per registered kind. The spec's statements of the versions' forms fix what each category
 * maps to: `node` kinds are directories of a 3.x line, `output` kinds are directories of the 4.0
 * line, and `decision` kinds are files of both. The registered suffix names the record.
 */
export function kindRecognitionCases(): readonly KindRecognitionCase[] {
  const categoryLaw: Readonly<
    Record<SpecTreeKindCategory, { lines: readonly SpecTreeMethodologyLine[]; type: SpecTreeEntryType }>
  > = {
    [SPEC_TREE_KIND_CATEGORY.NODE]: { lines: [SPEC_TREE_METHODOLOGY_LINE.THREE_TWO], type: SPEC_TREE_ENTRY_TYPE.NODE },
    [SPEC_TREE_KIND_CATEGORY.OUTPUT]: {
      lines: [SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO],
      type: SPEC_TREE_ENTRY_TYPE.NODE,
    },
    [SPEC_TREE_KIND_CATEGORY.DECISION]: {
      lines: [SPEC_TREE_METHODOLOGY_LINE.THREE_TWO, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO],
      type: SPEC_TREE_ENTRY_TYPE.DECISION,
    },
  };
  return (Object.keys(KIND_REGISTRY) as Kind[]).map((kind, drawIndex) => {
    const { category, suffix } = KIND_REGISTRY[kind];
    const { lines, type } = categoryLaw[category];
    const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), drawIndex);
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
    const parentOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), drawIndex + 1);
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex + 1);
    if (category !== SPEC_TREE_KIND_CATEGORY.DECISION) {
      return { kind, lines, expectedType: type, record: orderedDirectoryRecord(order, slug, suffix) };
    }
    const parentId = orderedDirectoryRecord(
      parentOrder,
      parentSlug,
      KIND_REGISTRY[requireFirst(registeredKindsOfCategory(SPEC_TREE_KIND_CATEGORY.NODE))].suffix,
    ).relativePath;
    return {
      kind,
      lines,
      expectedType: type,
      record: {
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
        relativePath: [parentId, indexedName(String(order), slug, suffix)].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
        parentId,
      },
    };
  });
}

/** Node directories the first naming-schema version accepts, each held alone under that version. */
export type FirstVersionNodeDirectoryCase = {
  readonly title: string;
  readonly options: SpecTreeRecognitionOptions;
  readonly record: { readonly type: SpecTreeFilesystemRecordType; readonly relativePath: string };
};

/** The naming-schema version that precedes every other under the independent semantic-version oracle. */
function firstNamingSchemaVersion(): NamingSchemaVersion {
  return [...SPEC_TREE_NAMING_SCHEMA_VERSIONS].sort((left, right) => semverOrderOracle(left.version, right.version))[0];
}

/** The node-directory suffixes the filename-grammar spec states the first naming-schema version before the live registry accepts. */
export const FIRST_VERSION_PRIOR_SUFFIX_STATEMENT = [".feature", ".story"] as const;

const FIRST_VERSION_NODE_SUFFIX_STATEMENT = [".capability", ...FIRST_VERSION_PRIOR_SUFFIX_STATEMENT] as const;

/** One node directory per node suffix the spec states for the first naming-schema version, recognized with that version alone selected. */
export function firstVersionNodeDirectoryCases(): readonly FirstVersionNodeDirectoryCase[] {
  const first = firstNamingSchemaVersion();
  return FIRST_VERSION_NODE_SUFFIX_STATEMENT.map((suffix, drawIndex) => ({
    title: `the first naming-schema version accepts the ${suffix} directory`,
    options: { schemaVersions: [first], selectedVersions: [first] },
    record: orderedDirectoryRecord(
      sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), drawIndex),
      sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex),
      suffix,
    ),
  }));
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

/** One exported kind sub-registry with the category that selects its members from `KIND_REGISTRY`. */
export type KindSubregistryCase = {
  readonly category: SpecTreeKindCategory;
  readonly kinds: readonly Kind[];
  readonly suffixes: readonly string[];
};

/** One exported sub-registry per registry category, pairing each with the category its members are filtered by. */
export function kindSubregistryCases(): readonly KindSubregistryCase[] {
  return [
    { category: SPEC_TREE_KIND_CATEGORY.NODE, kinds: NODE_KINDS, suffixes: NODE_SUFFIXES },
    { category: SPEC_TREE_KIND_CATEGORY.OUTPUT, kinds: OUTPUT_KINDS, suffixes: OUTPUT_SUFFIXES },
    { category: SPEC_TREE_KIND_CATEGORY.DECISION, kinds: DECISION_KINDS, suffixes: DECISION_SUFFIXES },
  ];
}

/** One group of registered kinds whose suffixes the spec requires to be pairwise distinct. */
export type SuffixUniquenessCase = {
  readonly title: string;
  readonly kinds: readonly Kind[];
};

/** The three suffix-uniqueness groups the spec declares: node directory suffixes, decision filename suffixes, and all registered suffixes. */
export function suffixUniquenessCases(): readonly SuffixUniquenessCase[] {
  const registered = Object.keys(KIND_REGISTRY) as Kind[];
  const isDecision = (kind: Kind): boolean => KIND_REGISTRY[kind].category === SPEC_TREE_KIND_CATEGORY.DECISION;
  return [
    { title: "node directory suffixes", kinds: registered.filter((kind) => !isDecision(kind)) },
    { title: "decision filename suffixes", kinds: registered.filter(isDecision) },
    { title: "all registered suffixes", kinds: registered },
  ];
}
