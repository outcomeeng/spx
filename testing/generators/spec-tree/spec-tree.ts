import * as fc from "fast-check";

import { METHODOLOGY_SECTION, validateMethodologyConfig } from "@/config/methodology";
import { NODE_STATUS_EXCLUDE_FILENAME, NODE_STATUS_EXCLUDE_PATH_GRAMMAR } from "@/lib/node-status";
import {
  canonicalNamingSchemaVersion,
  compareNamingSchemaVersions,
  type DecisionKind,
  type NamingSchemaVersion,
  type NodeKind,
  selectedSupersededNodeSuffixes,
  selectSpecTreeGrammar,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_SOURCE_ENTRY_KEYS,
  type SpecTreeDecisionSourceEntry,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeGrammarSelection,
  type SpecTreeKindCategory,
  type SpecTreeNodeKind,
  type SpecTreeNodeSourceEntry,
  type SpecTreeRegistry,
  type SpecTreeSource,
  type SpecTreeSourceEntry,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";
import { PYTHON_MARKER } from "@/validation/discovery/language-finder";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleGeneratedValue } from "@testing/generators/sample";

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

export type AssemblyNodeOrders = {
  readonly rootOrderSegments: readonly number[];
  readonly childOrderSegments: readonly number[];
  readonly peerOrderSegments: readonly number[];
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

export type SpecTreeSourceMappingCase =
  | {
    readonly title: string;
    readonly kind: typeof SPEC_TREE_SOURCE_MAPPING_CASE_KIND.PRODUCT_RELATIVE_REFS;
  }
  | {
    readonly title: string;
    readonly kind: typeof SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE;
    readonly entryType: RecognizedSpecTreeSourceEntryRole;
  };

export type SupersededNodeSuffixCase = {
  readonly title: string;
  readonly suffix: string;
  readonly version: string;
};

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
  ASSEMBLY_ORDER_COUNT: 3,
  SOURCE_ORDER_SEGMENT_COUNT_MIN: 1,
  SOURCE_ORDER_SEGMENT_COUNT_MAX: 3,
  ASSEMBLY_PROPERTY_RUN_COUNT: 25,
  UNREGISTERED_SUFFIX_MAX_LENGTH: 8,
} as const;
const SPEC_TREE_TEST_SUFFIX_INITIAL_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const SPEC_TREE_TEST_SUFFIX_REST_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz-"];
const UNREGISTERED_SUFFIX_DISAMBIGUATOR = "-candidate";

const ASSEMBLY_NODE_ORDER_COUNT: 3 = SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_ORDER_COUNT;

export const RETIRED_SPEC_APPLY_FIXTURE = {
  excludeFile: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, NODE_STATUS_EXCLUDE_FILENAME].join(
    NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR,
  ),
  pythonConfigFile: PYTHON_MARKER,
  pytestSection: "tool.pytest.ini_options",
  /** The retired subcommand the contract scenario names: `spx spec apply`. */
  command: "apply",
} as const;

export const SPEC_TREE_CASE_TITLE = "$title";

export const SPEC_TREE_TEST_GENERATOR = {
  counts: {
    assemblyPropertyRunCount: SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_PROPERTY_RUN_COUNT,
  },
  sourceId: arbitrarySourceId,
  sourceSlug: arbitrarySourceSlug,
  sourceTitle: arbitrarySourceTitle,
  sourceOrderSegments: arbitrarySourceOrderSegments,
  assemblyNodeOrderSegments: arbitraryAssemblyNodeOrderSegments,
  filesystemOrder: arbitraryFilesystemOrder,
  parentSourceOrderSegments: arbitraryParentSourceOrderSegments,
  childSourceOrderSegmentsAbove: arbitraryChildSourceOrderSegmentsAbove,
  evidenceFileName: arbitraryEvidenceFileName,
  unregisteredNodeSuffix: arbitraryUnregisteredNodeSuffix,
  invalidOrderedDirectory: arbitraryInvalidOrderedDirectory,
  supersededNodeSuffix: arbitrarySupersededNodeSuffix,
  sourceRef: arbitrarySourceRef,
  decisionKind: arbitraryDecisionKind,
  representativeFixture: arbitraryRepresentativeFixture,
  representativeFixtureWithGrandchild: arbitraryRepresentativeFixtureWithGrandchild,
} as const;

export function specTreeSourceMappingCases(): readonly SpecTreeSourceMappingCase[] {
  return [
    {
      title: "uses product-root-relative refs and an inclusion predicate",
      kind: SPEC_TREE_SOURCE_MAPPING_CASE_KIND.PRODUCT_RELATIVE_REFS,
    },
    {
      title: "maps product records",
      kind: SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE,
      entryType: SPEC_TREE_ENTRY_TYPE.PRODUCT,
    },
    {
      title: "maps node records",
      kind: SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE,
      entryType: SPEC_TREE_ENTRY_TYPE.NODE,
    },
    {
      title: "maps decision records",
      kind: SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE,
      entryType: SPEC_TREE_ENTRY_TYPE.DECISION,
    },
    {
      title: "maps co-located evidence records",
      kind: SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE,
      entryType: SPEC_TREE_ENTRY_TYPE.EVIDENCE,
    },
  ];
}

export function supersededNodeSuffixCases(
  versions: readonly NamingSchemaVersion[] = SPEC_TREE_NAMING_SCHEMA_VERSIONS,
): readonly SupersededNodeSuffixCase[] {
  const canonical = canonicalNamingSchemaVersion(versions);
  const canonicalSuffixes = new Set(canonical.nodeSuffixes);
  const seen = new Set<string>();
  const cases: SupersededNodeSuffixCase[] = [];
  const priorVersions = versions
    .filter((version) => version !== canonical)
    .sort((left, right) => compareNamingSchemaVersions(right, left));

  for (const version of priorVersions) {
    for (const suffix of version.nodeSuffixes) {
      if (canonicalSuffixes.has(suffix) || seen.has(suffix)) continue;
      seen.add(suffix);
      cases.push({
        title: `retains ${suffix} as superseded under naming schema ${version.version}`,
        suffix,
        version: version.version,
      });
    }
  }

  return cases;
}

export function sampleSpecTreeTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
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

export function orderedDirectoryName(suffix: string): string {
  const order: number = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
  const slug: string = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  return `${order}-${slug}${suffix}`;
}

/** An ordered node directory name with `suffix` that differs from every name in `taken`. */
export function distinctOrderedDirectoryName(suffix: string, taken: ReadonlySet<string>): string {
  let name = orderedDirectoryName(suffix);
  while (taken.has(name)) name = orderedDirectoryName(suffix);
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
  kind: NodeKind,
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

function arbitraryRepresentativeFixture(registry: SpecTreeRegistry): fc.Arbitrary<RepresentativeSpecTreeFixture> {
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
      nodeKinds: fc.tuple(arbitraryNodeKind(registry), arbitraryNodeKind(registry), arbitraryNodeKind(registry)),
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

function arbitraryAssemblyNodeOrderSegments(): fc.Arbitrary<AssemblyNodeOrders> {
  return fc
    .uniqueArray(arbitrarySourceOrderSegments(), {
      minLength: ASSEMBLY_NODE_ORDER_COUNT,
      maxLength: ASSEMBLY_NODE_ORDER_COUNT,
      selector: orderIndexText,
    })
    .map(toAssemblyNodeOrders);
}

function toAssemblyNodeOrders(orders: readonly (readonly number[])[]): AssemblyNodeOrders {
  const [rootOrderSegments, childOrderSegments, peerOrderSegments] = orders as readonly [
    readonly number[],
    readonly number[],
    readonly number[],
  ];
  return { rootOrderSegments, childOrderSegments, peerOrderSegments };
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
  }).map(({ slug, mode, level, tail }) =>
    [
      slug,
      mode,
      level,
      ...tail,
    ].join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR)
  );
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
  return fc.constantFrom(...selectedSupersededNodeSuffixes(selection));
}

function arbitraryUnregisteredNodeSuffix(
  registry: SpecTreeRegistry,
  selection: SpecTreeGrammarSelection = FIXTURE_SPEC_TREE_GRAMMAR_SELECTION,
): fc.Arbitrary<string> {
  const nodeSuffixes = new Set<string>([
    ...Object.values(registry)
      .filter((definition) => definition.category === SPEC_TREE_KIND_CATEGORY.NODE)
      .map((definition) => definition.suffix),
    ...selectedSupersededNodeSuffixes(selection),
  ]);
  return fc.tuple(
    fc.constantFrom(...SPEC_TREE_TEST_SUFFIX_INITIAL_CHARACTERS),
    fc.string({
      unit: fc.constantFrom(...SPEC_TREE_TEST_SUFFIX_REST_CHARACTERS),
      minLength: 0,
      maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.UNREGISTERED_SUFFIX_MAX_LENGTH - 1,
    }),
  )
    .map(([firstCharacter, rest]) => `.${firstCharacter}${rest}`)
    .map((suffix) => disambiguateRegisteredSuffix(suffix, nodeSuffixes));
}

function arbitraryInvalidOrderedDirectory(registry: SpecTreeRegistry): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryFilesystemOrder(), arbitrarySourceSlug(), arbitraryUnregisteredNodeSuffix(registry))
    .map(([order, slug, suffix]) => `${order}-${slug}${suffix}`);
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
