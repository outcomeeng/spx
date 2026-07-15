import * as fc from "fast-check";

import {
  canonicalNamingSchemaVersion,
  compareNamingSchemaVersions,
  type DecisionKind,
  type NamingSchemaVersion,
  type NodeKind,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_SOURCE_ENTRY_KEYS,
  SPEC_TREE_SUPERSEDED_NODE_SUFFIXES,
  type SpecTreeDecisionSourceEntry,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeKindCategory,
  type SpecTreeNodeSourceEntry,
  type SpecTreeRegistry,
  type SpecTreeSource,
  type SpecTreeSourceEntry,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";

type SpecTreeEntryDiscriminatorKey =
  | typeof SPEC_TREE_SOURCE_ENTRY_KEYS.TYPE
  | typeof SPEC_TREE_SOURCE_ENTRY_KEYS.KIND;

type SpecTreeEntryTypeKey = typeof SPEC_TREE_SOURCE_ENTRY_KEYS.TYPE;

export type RepresentativeSpecTreeFixture = {
  readonly product: Extract<SpecTreeSourceEntry, { readonly type: typeof SPEC_TREE_ENTRY_TYPE.PRODUCT }>;
  readonly root: SpecTreeNodeSourceEntry;
  readonly child: SpecTreeNodeSourceEntry;
  readonly peer: SpecTreeNodeSourceEntry;
  readonly decision: SpecTreeDecisionSourceEntry;
  readonly childEvidence: SpecTreeEvidenceSourceEntry;
  readonly peerEvidence: SpecTreeEvidenceSourceEntry;
  readonly entries: readonly SpecTreeSourceEntry[];
};

export type AssemblyNodeOrders = {
  readonly rootOrder: number;
  readonly childOrder: number;
  readonly peerOrder: number;
};

export const SPEC_TREE_SOURCE_MAPPING_CASE_KIND = {
  PRODUCT_RELATIVE_REFS: "product-relative-refs",
  RECOGNIZED_ENTRY_ROLE: "recognized-entry-role",
  DECISION_SHAPED_DESCENT: "decision-shaped-descent",
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
    readonly kind:
      | typeof SPEC_TREE_SOURCE_MAPPING_CASE_KIND.PRODUCT_RELATIVE_REFS
      | typeof SPEC_TREE_SOURCE_MAPPING_CASE_KIND.DECISION_SHAPED_DESCENT;
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
  ASSEMBLY_PROPERTY_RUN_COUNT: 25,
  UNREGISTERED_SUFFIX_MAX_LENGTH: 8,
} as const;
const SPEC_TREE_TEST_SUFFIX_INITIAL_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz"];
const SPEC_TREE_TEST_SUFFIX_REST_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyz-"];
const UNREGISTERED_SUFFIX_DISAMBIGUATOR = "-candidate";

const ASSEMBLY_NODE_ORDER_COUNT: 3 = SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_ORDER_COUNT;

export const RETIRED_SPEC_APPLY_FIXTURE = {
  command: "apply",
  excludeFile: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/EXCLUDE`,
  pythonConfigFile: "pyproject.toml",
  pytestSection: "tool.pytest.ini_options",
  // Commander emits this prefix for unknown subcommands before domain action handlers run.
  unknownCommandPrefix: "error: unknown command",
} as const;

export const SPEC_TREE_TEST_GENERATOR = {
  counts: {
    assemblyPropertyRunCount: SPEC_TREE_TEST_GENERATOR_OPTIONS.ASSEMBLY_PROPERTY_RUN_COUNT,
  },
  sourceId: arbitrarySourceId,
  sourceSlug: arbitrarySourceSlug,
  sourceTitle: arbitrarySourceTitle,
  sourceOrder: arbitrarySourceOrder,
  assemblyNodeOrders: arbitraryAssemblyNodeOrders,
  filesystemOrder: arbitraryFilesystemOrder,
  parentSourceOrder: arbitraryParentSourceOrder,
  childSourceOrderAbove: arbitraryChildSourceOrderAbove,
  evidenceFileName: arbitraryEvidenceFileName,
  unregisteredNodeSuffix: arbitraryUnregisteredNodeSuffix,
  invalidOrderedDirectory: arbitraryInvalidOrderedDirectory,
  supersededNodeSuffix: arbitrarySupersededNodeSuffix,
  sourceRef: arbitrarySourceRef,
  representativeFixture: arbitraryRepresentativeFixture,
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
    {
      title: "descends through directories whose names match decision grammar",
      kind: SPEC_TREE_SOURCE_MAPPING_CASE_KIND.DECISION_SHAPED_DESCENT,
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

export function orderedDirectoryName(suffix: string): string {
  const order: number = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
  const slug: string = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  return `${order}-${slug}${suffix}`;
}

export function createSource(entries: readonly SpecTreeSourceEntry[]): SpecTreeSource {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

export function buildRepresentativeFixture(registry: SpecTreeRegistry): RepresentativeSpecTreeFixture {
  return sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.representativeFixture(registry));
}

export function sampleNodeKind(registry: SpecTreeRegistry): NodeKind {
  return sampleSpecTreeTestValue(arbitraryNodeKind(registry));
}

export function sampleDecisionKind(registry: SpecTreeRegistry): DecisionKind {
  return sampleSpecTreeTestValue(arbitraryDecisionKind(registry));
}

export function specTreeFixtureNodeDirectoryName(
  registry: SpecTreeRegistry,
  node: RepresentativeSpecTreeFixture["root"],
): string {
  const definition = registry[node.kind];
  return `${node.order}-${node.slug}${definition.suffix}`;
}

export function buildNodeEntry(
  registry: SpecTreeRegistry,
  entry: Omit<SpecTreeNodeSourceEntry, SpecTreeEntryDiscriminatorKey>,
): SpecTreeNodeSourceEntry {
  return {
    type: SPEC_TREE_ENTRY_TYPE.NODE,
    kind: sampleSpecTreeTestValue(arbitraryNodeKind(registry)),
    ...entry,
  };
}

function buildDecisionEntry(
  registry: SpecTreeRegistry,
  entry: Omit<SpecTreeDecisionSourceEntry, SpecTreeEntryDiscriminatorKey>,
): SpecTreeDecisionSourceEntry {
  return {
    type: SPEC_TREE_ENTRY_TYPE.DECISION,
    kind: sampleSpecTreeTestValue(arbitraryDecisionKind(registry)),
    ...entry,
  };
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
    })
    .map(({ ids, slugs, titles, orders, productRef, rootRef }) => {
      const sortedOrders = [...orders].sort((left, right) => left - right);
      const [productId, rootId, childId, peerId, decisionId, childEvidenceId, peerEvidenceId] = ids;
      const [rootSlug, childSlug, peerSlug, decisionSlug] = slugs;
      const [productTitle, rootTitle, childTitle, peerTitle, decisionTitle] = titles;
      const [decisionOrder, rootOrder, childOrder, peerOrder] = sortedOrders;

      const product = {
        type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
        id: productId,
        title: productTitle,
        ref: productRef,
      };
      const root = buildNodeEntry(registry, {
        id: rootId,
        order: rootOrder,
        slug: rootSlug,
        title: rootTitle,
        ref: rootRef,
      });
      const child = buildNodeEntry(registry, {
        id: childId,
        order: childOrder,
        slug: childSlug,
        parentId: rootId,
        title: childTitle,
      });
      const peer = buildNodeEntry(registry, {
        id: peerId,
        order: peerOrder,
        slug: peerSlug,
        title: peerTitle,
      });
      const decision = buildDecisionEntry(registry, {
        id: decisionId,
        order: decisionOrder,
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

function arbitraryAssemblyNodeOrders(): fc.Arbitrary<AssemblyNodeOrders> {
  return fc
    .uniqueArray(arbitrarySourceOrder(), {
      minLength: ASSEMBLY_NODE_ORDER_COUNT,
      maxLength: ASSEMBLY_NODE_ORDER_COUNT,
    })
    .map(toAssemblyNodeOrders);
}

function toAssemblyNodeOrders(orders: readonly number[]): AssemblyNodeOrders {
  const [rootOrder, childOrder, peerOrder] = orders as readonly [number, number, number];
  return { rootOrder, childOrder, peerOrder };
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

function arbitrarySourceOrder(): fc.Arbitrary<number> {
  return fc.integer();
}

function arbitraryFilesystemOrder(): fc.Arbitrary<number> {
  // Filesystem fixtures exercise the current sparse two-digit node index range.
  return fc.integer({
    min: SPEC_TREE_TEST_GENERATOR_OPTIONS.FILESYSTEM_ORDER_MIN,
    max: SPEC_TREE_TEST_GENERATOR_OPTIONS.FILESYSTEM_ORDER_MAX,
  });
}

function arbitraryParentSourceOrder(): fc.Arbitrary<number> {
  return fc.integer({
    min: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_MIN,
    max: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_PARENT_ORDER_MAX,
  });
}

function arbitraryChildSourceOrderAbove(order: number): fc.Arbitrary<number> {
  if (order > SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_PARENT_ORDER_MAX) {
    throw new RangeError("Child source order requires a parent order below the maximum");
  }

  return fc.integer({
    min: order + SPEC_TREE_TEST_GENERATOR_OPTIONS.CHILD_ORDER_OFFSET,
    max: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_MAX,
  });
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

function arbitrarySupersededNodeSuffix(): fc.Arbitrary<string> {
  return fc.constantFrom(...SPEC_TREE_SUPERSEDED_NODE_SUFFIXES);
}

function arbitraryUnregisteredNodeSuffix(registry: SpecTreeRegistry): fc.Arbitrary<string> {
  const nodeSuffixes = new Set<string>([
    ...Object.values(registry)
      .filter((definition) => definition.category === SPEC_TREE_KIND_CATEGORY.NODE)
      .map((definition) => definition.suffix),
    ...SPEC_TREE_SUPERSEDED_NODE_SUFFIXES,
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
