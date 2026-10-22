import * as fc from "fast-check";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION, validateMethodologyConfig } from "@/config/methodology";
import type { Config } from "@/config/types";
import { NODE_STATUS_EXCLUDE_PATH_GRAMMAR } from "@/lib/node-status";
import {
  type DecisionKind,
  type NodeKind,
  selectSpecTreeGrammar,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_METHODOLOGY_LINE,
  SPEC_TREE_SECTION,
  SPEC_TREE_SOURCE_ENTRY_KEYS,
  type SpecTreeDecisionSourceEntry,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeGrammarSelection,
  type SpecTreeKindCategory,
  type SpecTreeMethodologyLine,
  type SpecTreeNodeKind,
  type SpecTreeNodeSourceEntry,
  type SpecTreeRegistry,
  type SpecTreeSource,
  type SpecTreeSourceEntry,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";
import { PYTHON_MARKER } from "@/validation/discovery/language-finder";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { SAMPLE_GENERATOR_PARAMETERS, sampleGeneratedValue } from "@testing/generators/sample";
import { evidenceFileNameFor, evidenceSubject } from "@testing/generators/spec-tree/evidence-file-name";
import { semverMaximumOracle, semverOrderOracle } from "@testing/generators/spec-tree/naming-schema-version";

type SpecTreeEntryDiscriminatorKey =
  | typeof SPEC_TREE_SOURCE_ENTRY_KEYS.TYPE
  | typeof SPEC_TREE_SOURCE_ENTRY_KEYS.KIND;

type SpecTreeEntryTypeKey = typeof SPEC_TREE_SOURCE_ENTRY_KEYS.TYPE;

/** A fixture node entry whose kind is a registered node kind. */
type RegisteredSpecTreeNodeEntry = SpecTreeNodeSourceEntry & { readonly kind: SpecTreeNodeKind };

function fixtureGrammarSelection(): SpecTreeGrammarSelection {
  const methodology = validateMethodologyConfig(MINIMAL_SPEC_TREE_CONFIG[METHODOLOGY_SECTION]);
  if (!methodology.ok) throw new Error(methodology.error);
  return selectSpecTreeGrammar(methodology.value);
}

/** The grammar selection of the methodology declaration the shared fixture config carries, which fixture trees are read under. */
export const FIXTURE_SPEC_TREE_GRAMMAR_SELECTION: SpecTreeGrammarSelection = fixtureGrammarSelection();

export type RepresentativeSpecTreeFixture = {
  readonly product: Extract<SpecTreeSourceEntry, { readonly type: typeof SPEC_TREE_ENTRY_TYPE.PRODUCT }>;
  readonly root: RegisteredSpecTreeNodeEntry;
  readonly child: RegisteredSpecTreeNodeEntry;
  readonly peer: RegisteredSpecTreeNodeEntry;
  readonly decision: SpecTreeDecisionSourceEntry;
  readonly childEvidence: SpecTreeEvidenceSourceEntry;
  readonly peerEvidence: SpecTreeEvidenceSourceEntry;
  readonly entries: readonly SpecTreeSourceEntry[];
};

/** A representative fixture with one node nested under its child, at a distinct id and a higher order. */
export type RepresentativeSpecTreeFixtureWithGrandchild = {
  readonly fixture: RepresentativeSpecTreeFixture;
  readonly grandchild: RegisteredSpecTreeNodeEntry;
};

/**
 * Node entries for one assembly case: top-level nodes and children of the first top-level node.
 * Sibling order indices are drawn from a small shared pool, so same-index siblings occur as often
 * as distinct-index ones.
 */
export type AssemblyScenario = {
  readonly entries: readonly SpecTreeSourceEntry[];
  readonly parentId: string;
  readonly topLevelIds: readonly string[];
  readonly childIds: readonly string[];
};

/**
 * A four-node tree whose preorder is root, child, grandchild, peer (the grandchild nests under the
 * child), with one generator-owned evidence id per node so a case assigns each node its status.
 */
export type TraversalFixture = {
  readonly root: RegisteredSpecTreeNodeEntry;
  readonly child: RegisteredSpecTreeNodeEntry;
  readonly grandchild: RegisteredSpecTreeNodeEntry;
  readonly peer: RegisteredSpecTreeNodeEntry;
  readonly evidenceIds: {
    readonly root: string;
    readonly child: string;
    readonly grandchild: string;
    readonly peer: string;
  };
};

export const SPEC_TREE_SOURCE_MAPPING_CASE_KIND = {
  PRODUCT_RELATIVE_REFS: "product-relative-refs",
  RECOGNIZED_ENTRY_ROLE: "recognized-entry-role",
} as const;

export type SpecTreeSourceMappingCaseKind =
  (typeof SPEC_TREE_SOURCE_MAPPING_CASE_KIND)[keyof typeof SPEC_TREE_SOURCE_MAPPING_CASE_KIND];

export type RecognizedSpecTreeSourceEntryRole =
  | typeof SPEC_TREE_ENTRY_TYPE.PRODUCT
  | typeof SPEC_TREE_ENTRY_TYPE.NODE
  | typeof SPEC_TREE_ENTRY_TYPE.DECISION
  | typeof SPEC_TREE_ENTRY_TYPE.EVIDENCE;

/**
 * The names a methodology line's target naming-schema version gives a product tree: the product
 * file suffix, the spec file suffix of a node, whether the root spec declares its kind in front
 * matter, and the node directory suffixes the version accepts. The values are the version's own
 * data, selected by the methodology line the case declares.
 */
export type SpecTreeSourceForm = {
  readonly line: SpecTreeMethodologyLine;
  readonly productSuffix: string;
  readonly specFileSuffix: string;
  readonly productDeclaresKind: boolean;
  readonly rootSuffix: string;
  readonly childSuffix: string;
  readonly peerSuffix: string;
};

export type SpecTreeSourceMappingCase =
  | {
    readonly title: string;
    readonly form: SpecTreeSourceForm;
    readonly kind: typeof SPEC_TREE_SOURCE_MAPPING_CASE_KIND.PRODUCT_RELATIVE_REFS;
  }
  | {
    readonly title: string;
    readonly form: SpecTreeSourceForm;
    readonly kind: typeof SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE;
    readonly entryType: RecognizedSpecTreeSourceEntryRole;
  };

export type SupersededNodeSuffixCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly suffix: string;
  readonly version: string;
};

/** The methodology lines whose forms a source reads and the spec statements present: 3.2 and 4.0. */
export const SPEC_TREE_SOURCE_LINES: readonly SpecTreeMethodologyLine[] = [
  SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
  SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
];

/** A product configuration whose methodology declaration names the line. */
export function specTreeConfigForLine(line: SpecTreeMethodologyLine): Config {
  return {
    [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: line },
    [SPEC_TREE_SECTION]: {},
  };
}

/** The grammar selection a methodology line makes, read from the known versions' own `lines` data. */
export function specTreeGrammarSelectionForLine(line: SpecTreeMethodologyLine): SpecTreeGrammarSelection {
  return {
    known: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
    selected: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS.filter((version) => version.lines.includes(line)),
  };
}

type SupersededOracleEntry = { readonly suffix: string; readonly version: string };

/**
 * Independent oracle for the suffixes a selection supersedes: every node suffix accepted by a known
 * version ordered at or before the target and not selected, and no selected version accepts, paired
 * with the newest such version. Ordering comes from the semantic-version oracle.
 */
export function supersededSuffixOracle(selection: SpecTreeGrammarSelection): readonly SupersededOracleEntry[] {
  const target = semverMaximumOracle(selection.selected);
  const selectedVersions = new Set(selection.selected.map((version) => version.version));
  const selectedSuffixes = new Set(selection.selected.flatMap((version) => version.nodeSuffixes));
  const priors = selection.known.filter((version) =>
    !selectedVersions.has(version.version) && semverOrderOracle(version.version, target.version) <= 0
  );
  const suffixes = [...new Set(priors.flatMap((version) => version.nodeSuffixes))].filter((suffix) =>
    !selectedSuffixes.has(suffix)
  );
  return suffixes.map((suffix) => ({
    suffix,
    version: semverMaximumOracle(priors.filter((version) => version.nodeSuffixes.includes(suffix))).version,
  }));
}

const SPEC_TREE_TEST_GENERATOR_OPTIONS = {
  REPRESENTATIVE_ID_COUNT: 7,
  REPRESENTATIVE_SLUG_COUNT: 4,
  REPRESENTATIVE_TITLE_COUNT: 5,
  REPRESENTATIVE_ORDER_COUNT: 4,
  REPRESENTATIVE_ORDER_MIN: 10,
  REPRESENTATIVE_PARENT_ORDER_MAX: 98,
  REPRESENTATIVE_ORDER_MAX: 99,
  FILESYSTEM_ORDER_MIN: 10,
  FILESYSTEM_ORDER_MAX: 99,
  CHILD_ORDER_OFFSET: 1,
  ASSEMBLY_ORDER_POOL_MIN: 1,
  ASSEMBLY_ORDER_POOL_MAX: 3,
  ASSEMBLY_TOP_LEVEL_MIN: 2,
  ASSEMBLY_TOP_LEVEL_MAX: 4,
  ASSEMBLY_CHILD_MIN: 1,
  ASSEMBLY_CHILD_MAX: 4,
  SOURCE_ORDER_SEGMENT_COUNT_MIN: 1,
  SOURCE_ORDER_SEGMENT_COUNT_MAX: 3,
  UNREGISTERED_SUFFIX_MAX_LENGTH: 8,
} as const;
const SPEC_TREE_TEST_SUFFIX_INITIAL_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const SPEC_TREE_TEST_SUFFIX_REST_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz-"];
const UNREGISTERED_SUFFIX_DISAMBIGUATOR = "-candidate";

export const RETIRED_SPEC_APPLY_FIXTURE = {
  excludeFile: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, SPEC_TREE_GRAMMAR.EXCLUSION_REGISTRY_FILENAME].join(
    NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR,
  ),
  pythonConfigFile: PYTHON_MARKER,
  pytestSection: "tool.pytest.ini_options",
  /** The retired subcommand the contract scenario names: `spx spec apply`. */
  command: "apply",
} as const;

export const SPEC_TREE_CASE_TITLE = "$title";

export const SPEC_TREE_TEST_GENERATOR = {
  sourceId: arbitrarySourceId,
  sourceSlug: arbitrarySourceSlug,
  sourceTitle: arbitrarySourceTitle,
  sourceOrderSegments: arbitrarySourceOrderSegments,
  assemblyScenario: arbitraryAssemblyScenario,
  filesystemOrder: arbitraryFilesystemOrder,
  parentSourceOrderSegments: arbitraryParentSourceOrderSegments,
  childSourceOrderSegmentsAbove: arbitraryChildSourceOrderSegmentsAbove,
  evidenceFileName: arbitraryEvidenceFileName,
  unregisteredNodeSuffix: arbitraryUnregisteredNodeSuffix,
  invalidOrderedDirectory: arbitraryInvalidOrderedDirectory,
  supersededNodeSuffix: arbitrarySupersededNodeSuffix,
  invalidOrderedDirectoryScenario: arbitraryInvalidOrderedDirectoryScenario,
  supersededOrderedDirectoryScenario: arbitrarySupersededOrderedDirectoryScenario,
  invalidDirectoryWithDescendant: (registry: SpecTreeRegistry) =>
    arbitraryWithDescendant(arbitraryInvalidOrderedDirectoryScenario(registry)),
  supersededDirectoryWithDescendant: () => arbitraryWithDescendant(arbitrarySupersededOrderedDirectoryScenario()),
  sourceRef: arbitrarySourceRef,
  decisionKind: arbitraryDecisionKind,
  representativeFixture: arbitraryRepresentativeFixture,
  representativeFixtureScenario: arbitraryRepresentativeFixtureScenario,
  representativeFixtureWithGrandchild: arbitraryRepresentativeFixtureWithGrandchild,
  traversalFixture: arbitraryTraversalFixture,
} as const;

function sourceFormForLine(line: SpecTreeMethodologyLine): SpecTreeSourceForm {
  const target = semverMaximumOracle(specTreeGrammarSelectionForLine(line).selected);
  const suffixes = fc.constantFrom(...target.nodeSuffixes);
  return {
    line,
    productSuffix: target.productSuffix,
    specFileSuffix: target.specFileSuffix,
    productDeclaresKind: target.rootSpecKind !== undefined,
    rootSuffix: sampleSpecTreeTestValue(suffixes, 0),
    childSuffix: sampleSpecTreeTestValue(suffixes, 1),
    peerSuffix: sampleSpecTreeTestValue(suffixes, 2),
  };
}

/** A representative fixture whose node kinds the line's target naming-schema version accepts, beside that line's form. */
export type RepresentativeFixtureScenario = {
  readonly form: SpecTreeSourceForm;
  readonly fixture: RepresentativeSpecTreeFixture;
};

function arbitraryRepresentativeFixtureScenario(
  registry: SpecTreeRegistry,
): fc.Arbitrary<RepresentativeFixtureScenario> {
  return fc.constantFrom(...SPEC_TREE_SOURCE_LINES).chain((line) => {
    const target = semverMaximumOracle(specTreeGrammarSelectionForLine(line).selected);
    const kinds = Object.entries(registry)
      .filter(([, definition]) =>
        (definition.category === SPEC_TREE_KIND_CATEGORY.NODE || definition.category === SPEC_TREE_KIND_CATEGORY.OUTPUT)
        && target.nodeSuffixes.includes(definition.suffix)
      )
      .map(([kind]) => kind as SpecTreeNodeKind);
    return arbitraryRepresentativeFixture(
      registry,
      fc.constantFrom(...requireNonEmpty(kinds, `node kind of methodology ${line}`)),
    ).map((fixture) => ({ form: sourceFormForLine(line), fixture }));
  });
}

const SPEC_TREE_SOURCE_ROLES = [
  { title: "maps product records", entryType: SPEC_TREE_ENTRY_TYPE.PRODUCT },
  { title: "maps node records", entryType: SPEC_TREE_ENTRY_TYPE.NODE },
  { title: "maps decision records", entryType: SPEC_TREE_ENTRY_TYPE.DECISION },
  { title: "maps co-located evidence records", entryType: SPEC_TREE_ENTRY_TYPE.EVIDENCE },
] as const;

/** One case per methodology line the spec statements present and per mapped record role. */
export function specTreeSourceMappingCases(): readonly SpecTreeSourceMappingCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line): readonly SpecTreeSourceMappingCase[] => {
    const form = sourceFormForLine(line);
    return [
      {
        title: `uses product-root-relative refs and an inclusion predicate under methodology ${line}`,
        form,
        kind: SPEC_TREE_SOURCE_MAPPING_CASE_KIND.PRODUCT_RELATIVE_REFS,
      },
      ...SPEC_TREE_SOURCE_ROLES.map((role) => ({
        title: `${role.title} under methodology ${line}`,
        form,
        kind: SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE,
        entryType: role.entryType,
      })),
    ];
  });
}

/**
 * One case per methodology line and per suffix the line leaves superseded, with the newest version
 * ordered before the line's target that accepts it. The expectation comes from the semantic-version
 * oracle over the known versions' own data.
 */
export function supersededNodeSuffixCases(): readonly SupersededNodeSuffixCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line) =>
    supersededSuffixOracle(specTreeGrammarSelectionForLine(line)).map(({ suffix, version }) => ({
      title: `retains ${suffix} as superseded under naming schema ${version} for methodology ${line}`,
      line,
      suffix,
      version,
    }))
  );
}

/**
 * One value from the arbitrary, drawn from the pinned sample seed offset by `drawIndex`. The same
 * arbitrary and index always give the same value, so a draw replays from the pinned seed; a caller
 * that needs several different values of one domain passes a different index for each.
 */
export function sampleSpecTreeTestValue<T>(arbitrary: fc.Arbitrary<T>, drawIndex = 0): T {
  const [value] = fc.sample(arbitrary, {
    ...SAMPLE_GENERATOR_PARAMETERS,
    seed: SAMPLE_GENERATOR_PARAMETERS.seed + drawIndex,
  });
  if (value === undefined) {
    throw new Error("Spec-tree test generator returned no sample");
  }
  return value;
}

/** The index text a run of order segments names, joined by the grammar's segment separator. */
export function orderIndexText(orderSegments: readonly number[]): string {
  return orderSegments.join(SPEC_TREE_GRAMMAR.ORDER.SEGMENT_SEPARATOR);
}

/** The order segments of a single-segment index, as the fixture entries carry them. */
export function singleSegmentOrder(index: number): readonly number[] {
  return [index];
}

/** A single-node source entry whose id is composed from the grammar's order separator, slug, and kind suffix. */
export function sampleSingleNodeSourceEntry(registry: SpecTreeRegistry): SpecTreeNodeSourceEntry {
  const kind = sampleNodeKind(registry);
  const order: number = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
  const slug: string = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  return {
    type: SPEC_TREE_ENTRY_TYPE.NODE,
    id: `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${registry[kind].suffix}`,
    kind,
    orderSegments: singleSegmentOrder(order),
    slug,
  };
}

export function orderedDirectoryName(suffix: string, drawIndex = 0): string {
  const order: number = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), drawIndex);
  const slug: string = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), drawIndex);
  return `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`;
}

/** An ordered node directory name with `suffix` that differs from every name in `taken`. */
export function distinctOrderedDirectoryName(suffix: string, taken: ReadonlySet<string>): string {
  let drawIndex = 0;
  let name = orderedDirectoryName(suffix, drawIndex);
  while (taken.has(name)) {
    drawIndex += 1;
    name = orderedDirectoryName(suffix, drawIndex);
  }
  return name;
}

export function createSource(entries: readonly SpecTreeSourceEntry[]): SpecTreeSource {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

export function createSerializedSource(entries: readonly SpecTreeSourceEntry[]): SpecTreeSource {
  const serialized = JSON.stringify(entries);
  return {
    async *entries() {
      yield* JSON.parse(serialized) as SpecTreeSourceEntry[];
    },
  };
}

export function buildRepresentativeFixture(registry: SpecTreeRegistry): RepresentativeSpecTreeFixture {
  return sampleGeneratedValue(SPEC_TREE_TEST_GENERATOR.representativeFixture(registry));
}

export function buildTraversalFixture(registry: SpecTreeRegistry): TraversalFixture {
  return sampleGeneratedValue(SPEC_TREE_TEST_GENERATOR.traversalFixture(registry));
}

export function sampleNodeKind(registry: SpecTreeRegistry): NodeKind {
  return sampleSpecTreeTestValue(arbitraryNodeKind(registry));
}

export function specTreeFixtureNodeDirectoryName(
  registry: SpecTreeRegistry,
  node: RepresentativeSpecTreeFixture["root"],
): string {
  const definition = registry[node.kind];
  return `${orderIndexText(node.orderSegments)}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${node.slug}${definition.suffix}`;
}

export function buildNodeEntry(
  registry: SpecTreeRegistry,
  entry: Omit<SpecTreeNodeSourceEntry, SpecTreeEntryDiscriminatorKey>,
): RegisteredSpecTreeNodeEntry {
  return nodeEntry(sampleGeneratedValue(arbitraryNodeKind(registry)), entry);
}

function nodeEntry(
  kind: SpecTreeNodeKind,
  entry: Omit<SpecTreeNodeSourceEntry, SpecTreeEntryDiscriminatorKey>,
): RegisteredSpecTreeNodeEntry {
  return { type: SPEC_TREE_ENTRY_TYPE.NODE, kind, ...entry };
}

function decisionEntry(
  kind: DecisionKind,
  entry: Omit<SpecTreeDecisionSourceEntry, SpecTreeEntryDiscriminatorKey>,
): SpecTreeDecisionSourceEntry {
  return { type: SPEC_TREE_ENTRY_TYPE.DECISION, kind, ...entry };
}

export function buildEvidenceEntry(
  entry: Omit<SpecTreeEvidenceSourceEntry, SpecTreeEntryTypeKey>,
): SpecTreeEvidenceSourceEntry {
  return {
    type: SPEC_TREE_ENTRY_TYPE.EVIDENCE,
    ...entry,
  };
}

function arbitraryRepresentativeFixture(
  registry: SpecTreeRegistry,
  nodeKind: fc.Arbitrary<SpecTreeNodeKind> = arbitraryNodeKind(registry),
): fc.Arbitrary<RepresentativeSpecTreeFixture> {
  return fc
    .record({
      ids: fc.uniqueArray(arbitrarySourceId(), {
        minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ID_COUNT,
        maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ID_COUNT,
      }),
      slugs: fc.uniqueArray(arbitrarySourceSlug(), {
        minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_SLUG_COUNT,
        maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_SLUG_COUNT,
      }),
      titles: fc.uniqueArray(arbitrarySourceTitle(), {
        minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_TITLE_COUNT,
        maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_TITLE_COUNT,
      }),
      orders: fc.uniqueArray(
        fc.integer({
          min: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_MIN,
          max: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_MAX,
        }),
        {
          minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_COUNT,
          maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_COUNT,
        },
      ),
      productRef: arbitrarySourceRef(),
      rootRef: arbitrarySourceRef(),
      nodeKinds: fc.tuple(nodeKind, nodeKind, nodeKind),
      decisionKind: arbitraryDecisionKind(registry),
    })
    .map(({ ids, slugs, titles, orders, productRef, rootRef, nodeKinds, decisionKind }) => {
      const sortedOrders = [...orders].sort((left, right) => left - right);
      const [productId, rootId, childId, peerId, decisionId, childEvidenceId, peerEvidenceId] = ids;
      const [rootSlug, childSlug, peerSlug, decisionSlug] = slugs;
      const [productTitle, rootTitle, childTitle, peerTitle, decisionTitle] = titles;
      const [decisionOrder, rootOrder, childOrder, peerOrder] = sortedOrders.map(singleSegmentOrder);
      const [rootKind, childKind, peerKind] = nodeKinds;

      const product = {
        type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
        id: productId,
        title: productTitle,
        ref: productRef,
      };
      const root = nodeEntry(rootKind, {
        id: rootId,
        orderSegments: rootOrder,
        slug: rootSlug,
        title: rootTitle,
        ref: rootRef,
      });
      const child = nodeEntry(childKind, {
        id: childId,
        orderSegments: childOrder,
        slug: childSlug,
        parentId: rootId,
        title: childTitle,
      });
      const peer = nodeEntry(peerKind, {
        id: peerId,
        orderSegments: peerOrder,
        slug: peerSlug,
        title: peerTitle,
      });
      const decision = decisionEntry(decisionKind, {
        id: decisionId,
        orderSegments: decisionOrder,
        slug: decisionSlug,
        parentId: rootId,
        title: decisionTitle,
      });
      const childEvidence = buildEvidenceEntry({
        id: childEvidenceId,
        parentId: childId,
        status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
      });
      const peerEvidence = buildEvidenceEntry({
        id: peerEvidenceId,
        parentId: peerId,
        status: SPEC_TREE_EVIDENCE_STATUS.FAILING,
      });

      return {
        product,
        root,
        child,
        peer,
        decision,
        childEvidence,
        peerEvidence,
        entries: [product, root, child, peer, decision, childEvidence, peerEvidence],
      };
    });
}

function arbitraryTraversalFixture(registry: SpecTreeRegistry): fc.Arbitrary<TraversalFixture> {
  return arbitraryRepresentativeFixtureWithGrandchild(registry).chain(({ fixture, grandchild }) => {
    const takenIds = new Set([...fixture.entries.map((entry) => entry.id), grandchild.id]);
    return fc
      .uniqueArray(arbitrarySourceId().filter((id) => !takenIds.has(id)), {
        minLength: TRAVERSAL_EVIDENCE_ID_COUNT,
        maxLength: TRAVERSAL_EVIDENCE_ID_COUNT,
      })
      .map(([root, child, grandchildEvidence, peer]) => ({
        root: fixture.root,
        child: fixture.child,
        grandchild,
        peer: fixture.peer,
        evidenceIds: { root, child, grandchild: grandchildEvidence, peer },
      }));
  });
}

const TRAVERSAL_EVIDENCE_ID_COUNT = 4;

function arbitraryRepresentativeFixtureWithGrandchild(
  registry: SpecTreeRegistry,
): fc.Arbitrary<RepresentativeSpecTreeFixtureWithGrandchild> {
  return arbitraryRepresentativeFixture(registry).chain((fixture) => {
    const takenIds = new Set(fixture.entries.map((entry) => entry.id));
    return fc
      .record({
        id: arbitrarySourceId().filter((id) => !takenIds.has(id)),
        orderSegments: arbitraryChildSourceOrderSegmentsAbove(fixture.child.orderSegments),
        slug: arbitrarySourceSlug(),
        kind: arbitraryNodeKind(registry),
      })
      .map(({ id, orderSegments, slug, kind }) => ({
        fixture,
        grandchild: nodeEntry(kind, { id, orderSegments, slug, parentId: fixture.child.id }),
      }));
  });
}

function arbitraryAssemblyScenario(registry: SpecTreeRegistry): fc.Arbitrary<AssemblyScenario> {
  return fc
    .uniqueArray(arbitrarySourceOrderSegments(), {
      minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_ORDER_POOL_MIN,
      maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_ORDER_POOL_MAX,
      selector: orderIndexText,
    })
    .chain((pool) => {
      const sibling = fc.record({
        id: arbitrarySourceId(),
        slug: arbitrarySourceSlug(),
        kind: arbitraryNodeKind(registry),
        orderSegments: fc.constantFrom(...pool),
      });
      return fc.record({
        topLevel: fc.array(sibling, {
          minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_TOP_LEVEL_MIN,
          maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_TOP_LEVEL_MAX,
        }),
        children: fc.array(sibling, {
          minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_CHILD_MIN,
          maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_CHILD_MAX,
        }),
      });
    })
    .filter(({ topLevel, children }) => {
      const ids = [...topLevel, ...children].map((node) => node.id);
      return new Set(ids).size === ids.length;
    })
    .map(({ topLevel, children }): AssemblyScenario => {
      const parentId = topLevel[0].id;
      const topLevelEntries = topLevel.map(({ kind, ...entry }) => nodeEntry(kind, entry));
      const childEntries = children.map(({ kind, ...entry }) => nodeEntry(kind, { ...entry, parentId }));
      return {
        entries: [...topLevelEntries, ...childEntries],
        parentId,
        topLevelIds: topLevel.map((node) => node.id),
        childIds: children.map((node) => node.id),
      };
    });
}

function arbitrarySourceId(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitrarySourceSlug(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitrarySourceTitle(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitraryEvidenceFileName(): fc.Arbitrary<string> {
  return fc.record({
    slug: arbitrarySourceSlug(),
    mode: fc.constantFrom(...SPEC_TREE_EVIDENCE_FILE.MODES),
    level: fc.constantFrom(...SPEC_TREE_EVIDENCE_FILE.LEVELS),
    tail: fc.constantFrom(...Object.values(SPEC_TREE_EVIDENCE_FILE.TAILS)),
  }).map(({ slug, mode, level, tail }) => evidenceFileNameFor([evidenceSubject(slug), mode, level], tail));
}

function arbitrarySourceOrderSegments(): fc.Arbitrary<readonly number[]> {
  return fc.array(fc.nat(), {
    minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.SOURCE_ORDER_SEGMENT_COUNT_MIN,
    maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.SOURCE_ORDER_SEGMENT_COUNT_MAX,
  });
}

function arbitraryFilesystemOrder(): fc.Arbitrary<number> {
  // Filesystem fixtures exercise the current sparse two-digit node index range.
  return fc.integer({
    min: SPEC_TREE_TEST_GENERATOR_OPTIONS.FILESYSTEM_ORDER_MIN,
    max: SPEC_TREE_TEST_GENERATOR_OPTIONS.FILESYSTEM_ORDER_MAX,
  });
}

function arbitraryParentSourceOrderSegments(): fc.Arbitrary<readonly number[]> {
  return fc
    .integer({
      min: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_MIN,
      max: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_PARENT_ORDER_MAX,
    })
    .map(singleSegmentOrder);
}

/** A single-segment index above the leading segment of `orderSegments`, within the representative range. */
function arbitraryChildSourceOrderSegmentsAbove(orderSegments: readonly number[]): fc.Arbitrary<readonly number[]> {
  const [leading] = orderSegments;
  if (leading > SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_PARENT_ORDER_MAX) {
    throw new RangeError("Child source order requires a parent order below the maximum");
  }

  return fc
    .integer({
      min: leading + SPEC_TREE_TEST_GENERATOR_OPTIONS.CHILD_ORDER_OFFSET,
      max: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_MAX,
    })
    .map(singleSegmentOrder);
}

function arbitrarySourceRef(): fc.Arbitrary<SpecTreeSourceRef> {
  return arbitrarySourceId().map((id) => ({
    id,
    path: id,
  }));
}

function arbitraryNodeKind(registry: SpecTreeRegistry): fc.Arbitrary<NodeKind> {
  return fc.constantFrom(
    ...readKinds<NodeKind>(registry, SPEC_TREE_KIND_CATEGORY.NODE, "node kind"),
  );
}

function arbitraryDecisionKind(registry: SpecTreeRegistry): fc.Arbitrary<DecisionKind> {
  return fc.constantFrom(
    ...readKinds<DecisionKind>(registry, SPEC_TREE_KIND_CATEGORY.DECISION, "decision kind"),
  );
}

function arbitrarySupersededNodeSuffix(
  selection: SpecTreeGrammarSelection = FIXTURE_SPEC_TREE_GRAMMAR_SELECTION,
): fc.Arbitrary<string> {
  return fc.constantFrom(...supersededSuffixOracle(selection).map((entry) => entry.suffix));
}

/**
 * A node directory suffix neither a selected version nor the independent superseded oracle accepts:
 * a random suffix outside both sets, or a suffix only a version ordered after the declared target
 * accepts. The domain is bounded by the oracle and the selected versions' own data, never by the
 * production recognizer.
 */
function arbitraryUnregisteredNodeSuffix(
  registry: SpecTreeRegistry,
  selection: SpecTreeGrammarSelection = FIXTURE_SPEC_TREE_GRAMMAR_SELECTION,
): fc.Arbitrary<string> {
  const selectedSuffixes = selection.selected.flatMap((version) => version.nodeSuffixes);
  const supersededSuffixes = supersededSuffixOracle(selection).map((entry) => entry.suffix);
  const accepted = new Set<string>([
    ...Object.values(registry)
      .filter((definition) => definition.category === SPEC_TREE_KIND_CATEGORY.NODE)
      .map((definition) => definition.suffix),
    ...selectedSuffixes,
    ...supersededSuffixes,
  ]);
  const laterOnlySuffixes = [
    ...new Set(selection.known.flatMap((version) => version.nodeSuffixes)),
  ].filter((suffix) => !accepted.has(suffix));
  const random = fc.tuple(
    fc.constantFrom(...SPEC_TREE_TEST_SUFFIX_INITIAL_CHARACTERS),
    fc.string({
      unit: fc.constantFrom(...SPEC_TREE_TEST_SUFFIX_REST_CHARACTERS),
      minLength: 0,
      maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.UNREGISTERED_SUFFIX_MAX_LENGTH - 1,
    }),
  )
    .map(([firstCharacter, rest]) => `.${firstCharacter}${rest}`)
    .map((suffix) => disambiguateRegisteredSuffix(suffix, new Set([...accepted, ...laterOnlySuffixes])));
  if (laterOnlySuffixes.length === 0) return random;
  return fc.oneof(random, fc.constantFrom(...laterOnlySuffixes));
}

function arbitraryInvalidOrderedDirectory(
  registry: SpecTreeRegistry,
  selection: SpecTreeGrammarSelection = FIXTURE_SPEC_TREE_GRAMMAR_SELECTION,
): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryFilesystemOrder(), arbitrarySourceSlug(), arbitraryUnregisteredNodeSuffix(registry, selection))
    .map(([order, slug, suffix]) => `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`);
}

/** An ordered directory name a methodology line classifies as the scenario's role, beside the line. */
export type OrderedDirectoryScenario = {
  readonly line: SpecTreeMethodologyLine;
  readonly directory: string;
};

/** An ordered directory beside a registered node directory and spec file the line accepts below it. */
export type DirectoryWithDescendantScenario = OrderedDirectoryScenario & {
  readonly descendantDirectory: string;
  readonly descendantSpecFile: string;
};

function arbitraryInvalidOrderedDirectoryScenario(registry: SpecTreeRegistry): fc.Arbitrary<OrderedDirectoryScenario> {
  return fc.constantFrom(...SPEC_TREE_SOURCE_LINES).chain((line) =>
    arbitraryInvalidOrderedDirectory(registry, specTreeGrammarSelectionForLine(line)).map((directory) => ({
      line,
      directory,
    }))
  );
}

function arbitrarySupersededOrderedDirectoryScenario(): fc.Arbitrary<OrderedDirectoryScenario> {
  return fc.constantFrom(...SPEC_TREE_SOURCE_LINES).chain((line) =>
    fc
      .tuple(
        arbitraryFilesystemOrder(),
        arbitrarySourceSlug(),
        arbitrarySupersededNodeSuffix(specTreeGrammarSelectionForLine(line)),
      )
      .map(([order, slug, suffix]) => ({
        line,
        directory: `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`,
      }))
  );
}

function arbitraryWithDescendant(
  scenarios: fc.Arbitrary<OrderedDirectoryScenario>,
): fc.Arbitrary<DirectoryWithDescendantScenario> {
  return scenarios.chain((scenario) => {
    const target = semverMaximumOracle(specTreeGrammarSelectionForLine(scenario.line).selected);
    return fc
      .tuple(arbitraryFilesystemOrder(), arbitrarySourceSlug(), fc.constantFrom(...target.nodeSuffixes))
      .map(([order, slug, suffix]) => ({
        ...scenario,
        descendantDirectory: `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`,
        descendantSpecFile: `${slug}${target.specFileSuffix}`,
      }));
  });
}

function disambiguateRegisteredSuffix(suffix: string, registeredSuffixes: ReadonlySet<string>): string {
  if (!registeredSuffixes.has(suffix)) {
    return suffix;
  }

  // At most `size` candidates can collide, so `size + 1` attempts guarantees one free suffix.
  for (let collisionIndex = 0; collisionIndex <= registeredSuffixes.size; collisionIndex += 1) {
    const candidate = `${suffix}${UNREGISTERED_SUFFIX_DISAMBIGUATOR}${collisionIndex}`;
    if (!registeredSuffixes.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate an unregistered spec-tree suffix");
}

function readKinds<K extends NodeKind | DecisionKind>(
  registry: SpecTreeRegistry,
  category: SpecTreeKindCategory,
  description: string,
): [K, ...K[]] {
  const kinds = Object.entries(registry)
    .filter(([, definition]) => definition.category === category)
    .map(([kind]) => kind as K);
  return requireNonEmpty(kinds, description);
}

function requireNonEmpty<T>(values: readonly T[], description: string): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) {
    throw new Error(`Spec-tree registry has no ${description}`);
  }
  return [first, ...rest];
}
