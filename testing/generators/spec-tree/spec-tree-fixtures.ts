/**
 * Input domains for the evidence of the spec-tree fixture generator and its `withSpecTreeEnv`
 * materialization: the entry roles of a representative fixture, the kind registries a fixture can
 * be generated from, slugs that do and do not climb out of the temp product directory, and test
 * trees whose fixture support modules sit in node-local or top-level test infrastructure.
 *
 * @module generators/spec-tree/spec-tree-fixtures
 */

import { posix } from "node:path";

import * as fc from "fast-check";

import {
  type DecisionKind,
  KIND_REGISTRY,
  type NodeKind,
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  type SpecTreeRegistry,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { evidenceFileNameFor, evidenceSubject } from "@testing/generators/spec-tree/evidence-file-name";
import { admittedChildKindsOracle } from "@testing/generators/spec-tree/kind-grammar";
import { type RepresentativeSpecTreeFixture, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

/** The named entries of a representative fixture: every member of the fixture except its `entries` list. */
export const SPEC_TREE_FIXTURE_ENTRY_ROLE = {
  PRODUCT: "product",
  ROOT: "root",
  CHILD: "child",
  PEER: "peer",
  DECISION: "decision",
  CHILD_EVIDENCE: "childEvidence",
  PEER_EVIDENCE: "peerEvidence",
} as const satisfies Record<string, Exclude<keyof RepresentativeSpecTreeFixture, "entries">>;

export type SpecTreeFixtureEntryRole = (typeof SPEC_TREE_FIXTURE_ENTRY_ROLE)[keyof typeof SPEC_TREE_FIXTURE_ENTRY_ROLE];

/** Whether each role's slug names a materialized path; keyed by every fixture member, so a role added to the fixture must be classified here. */
const ROLE_NAMES_PATH = {
  [SPEC_TREE_FIXTURE_ENTRY_ROLE.PRODUCT]: false,
  [SPEC_TREE_FIXTURE_ENTRY_ROLE.ROOT]: true,
  [SPEC_TREE_FIXTURE_ENTRY_ROLE.CHILD]: true,
  [SPEC_TREE_FIXTURE_ENTRY_ROLE.PEER]: true,
  [SPEC_TREE_FIXTURE_ENTRY_ROLE.DECISION]: true,
  [SPEC_TREE_FIXTURE_ENTRY_ROLE.CHILD_EVIDENCE]: false,
  [SPEC_TREE_FIXTURE_ENTRY_ROLE.PEER_EVIDENCE]: false,
} as const satisfies { readonly [role in Exclude<keyof RepresentativeSpecTreeFixture, "entries">]: boolean };

/** The entry roles whose slug names a materialized directory or file. */
export type SpecTreeFixturePathRole = {
  readonly [role in SpecTreeFixtureEntryRole]: (typeof ROLE_NAMES_PATH)[role] extends true ? role : never;
}[SpecTreeFixtureEntryRole];

/** Every entry role of a representative fixture, the finite domain a fixture mapping ranges over. */
export const SPEC_TREE_FIXTURE_ENTRY_ROLES = Object.keys(ROLE_NAMES_PATH) as readonly SpecTreeFixtureEntryRole[];

/** Every entry role whose slug names a materialized path. */
export const SPEC_TREE_FIXTURE_PATH_ROLES = SPEC_TREE_FIXTURE_ENTRY_ROLES.filter(
  (role): role is SpecTreeFixturePathRole => ROLE_NAMES_PATH[role],
);

/** A kind registry that differs from the production registry, beside the node and decision kinds it keeps. */
export type InjectedKindRegistryCase = {
  readonly title: string;
  readonly registry: SpecTreeRegistry;
  readonly nodeKinds: readonly NodeKind[];
  readonly decisionKinds: readonly DecisionKind[];
};

/**
 * Every registry that keeps a non-empty subset of the production node kinds and a non-empty subset
 * of its decision kinds, other than the production registry itself. A node subset is kept only when
 * the admitted-children oracle lets a representative fixture assemble from it: some kept kind sits
 * under the product, and every kept kind the product admits admits a kept child kind. Output kinds
 * are kept unchanged. The production registry type is the literal type of its value, so each
 * sub-registry is typed through it; fixture generation reads a registry only through its entries.
 */
export function injectedKindRegistryCases(): readonly InjectedKindRegistryCase[] {
  const nodeKinds = kindsOfCategory<NodeKind>(SPEC_TREE_KIND_CATEGORY.NODE);
  const decisionKinds = kindsOfCategory<DecisionKind>(SPEC_TREE_KIND_CATEGORY.DECISION);
  return nonEmptySubsets(nodeKinds).filter(assemblesRepresentativeFixture).flatMap((keptNodes) =>
    nonEmptySubsets(decisionKinds)
      .filter((keptDecisions) => keptNodes.length < nodeKinds.length || keptDecisions.length < decisionKinds.length)
      .map((keptDecisions): InjectedKindRegistryCase => {
        const kept = new Set<string>([...keptNodes, ...keptDecisions]);
        const registry = Object.fromEntries(
          Object.entries(KIND_REGISTRY).filter(([kind, definition]) =>
            definition.category === SPEC_TREE_KIND_CATEGORY.OUTPUT || kept.has(kind)
          ),
        ) as unknown as SpecTreeRegistry;
        return {
          title: `node kinds ${keptNodes.join(", ")} and decision kinds ${keptDecisions.join(", ")}`,
          registry,
          nodeKinds: keptNodes,
          decisionKinds: keptDecisions,
        };
      })
  );
}

function kindsOfCategory<K extends string>(category: string): readonly K[] {
  return Object.entries(KIND_REGISTRY)
    .filter(([, definition]) => definition.category === category)
    .map(([kind]) => kind as K);
}

function nonEmptySubsets<T>(values: readonly T[]): readonly (readonly T[])[] {
  const subsets: (readonly T[])[] = [];
  for (let mask = 1; mask < 2 ** values.length; mask += 1) {
    subsets.push(values.filter((_, position) => (mask >> position) % 2 === 1));
  }
  return subsets;
}

function assemblesRepresentativeFixture(nodeKinds: readonly NodeKind[]): boolean {
  const topLevel = nodeKinds.filter((kind) => admittedChildKindsOracle(SPEC_TREE_CONFIG.PRODUCT.KIND).includes(kind));
  return topLevel.length > 0
    && topLevel.every((kind) => nodeKinds.some((child) => admittedChildKindsOracle(kind).includes(child)));
}

const PARENT_DIRECTORY_SEGMENT = "..";

/**
 * Bounds on the parent-directory segments an escaping slug carries. The deepest path a
 * representative fixture materializes is an evidence file, five segments below the product
 * directory, so a slug with more parent segments than that climbs out of the product directory
 * wherever the materializer places it.
 */
const FIXTURE_PATH_ESCAPE = {
  MIN_PARENT_SEGMENTS: 6,
  MAX_PARENT_SEGMENTS: 10,
} as const;

/** A slug that climbs out of the temp product directory: a run of parent-directory segments, then a generated slug. */
function arbitraryEscapingFixtureSlug(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: FIXTURE_PATH_ESCAPE.MIN_PARENT_SEGMENTS, max: FIXTURE_PATH_ESCAPE.MAX_PARENT_SEGMENTS }),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    )
    .map(([climb, slug]) =>
      [...Array.from({ length: climb }, () => PARENT_DIRECTORY_SEGMENT), slug].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)
    );
}

/**
 * A slug whose every path stays inside the temp product directory: a generated slug, or one that
 * descends a generated segment and climbs straight back before naming a generated slug.
 */
function arbitraryContainedFixtureSlug(): fc.Arbitrary<string> {
  return fc.oneof(
    SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    fc
      .tuple(SPEC_TREE_TEST_GENERATOR.sourceSlug(), SPEC_TREE_TEST_GENERATOR.sourceSlug())
      .map(([descent, slug]) => [descent, PARENT_DIRECTORY_SEGMENT, slug].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)),
  );
}

/** A representative fixture whose `role` entry carries `slug`, beside the final path segment that slug names. */
export type FixtureWithEntrySlug = {
  readonly fixture: RepresentativeSpecTreeFixture;
  readonly slug: string;
  readonly finalSegment: string;
};

function arbitraryFixtureWithEntrySlug(
  role: SpecTreeFixturePathRole,
  slugs: fc.Arbitrary<string>,
): fc.Arbitrary<FixtureWithEntrySlug> {
  return fc
    .tuple(SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY), slugs)
    .map(([fixture, slug]) => {
      const replaced = { ...fixture[role], slug };
      return {
        fixture: {
          ...fixture,
          [role]: replaced,
          entries: fixture.entries.map((entry) => entry.id === replaced.id ? replaced : entry),
        },
        slug,
        finalSegment: posix.basename(slug),
      };
    });
}

/** Where a fixture support module sits and how many test files import it. */
export const SUPPORT_PLACEMENT = {
  NODE_LOCAL_REUSED: "node-local support imported by several test files",
  NODE_LOCAL_SINGLE: "node-local support imported by one test file",
  TOP_LEVEL_REUSED: "top-level support imported by several test files",
} as const;

export type SupportPlacement = (typeof SUPPORT_PLACEMENT)[keyof typeof SUPPORT_PLACEMENT];

/** A node-local support module more than one test file imports, beside those importers in ascending order. */
export type ReusedSupportExpectation = {
  readonly supportPath: string;
  readonly importers: readonly string[];
};

/** Product-relative files of a generated test tree, and the reused node-local support its construction places. */
export type SupportPlacementScenario = {
  readonly files: readonly { readonly path: string; readonly contents: string }[];
  readonly reused: readonly ReusedSupportExpectation[];
};

/** The top-level test infrastructure directory and the module alias that resolves to it. */
const TOP_LEVEL_TEST_INFRASTRUCTURE = {
  DIRECTORY: "testing",
  ALIAS: "@testing",
} as const;
const SUPPORT_MODULE_EXTENSION = ".ts";
const SUPPORT_EXPORT_NAME = "fixtureValue";
const RELATIVE_SPECIFIER_PREFIX = "./";
const SUPPORT_IMPORTER_COUNT = { SINGLE: 1, REUSED_MIN: 2, REUSED_MAX: 4 } as const;
const SUPPORT_NODE_DIRECTORY_COUNT = 2;

/**
 * A test tree of two top-level node directories whose test files import one fixture support
 * module. Node-local support sits in the first node's evidence directory and each importer reaches
 * it through a relative specifier; top-level support sits in the top-level test infrastructure
 * directory and each importer reaches it through its alias. Importers are spread over both nodes'
 * evidence directories. Only node-local support with several importers is reused.
 */
function arbitrarySupportPlacementScenario(placement: SupportPlacement): fc.Arbitrary<SupportPlacementScenario> {
  const importerCount = placement === SUPPORT_PLACEMENT.NODE_LOCAL_SINGLE
    ? fc.constant(SUPPORT_IMPORTER_COUNT.SINGLE)
    : fc.integer({ min: SUPPORT_IMPORTER_COUNT.REUSED_MIN, max: SUPPORT_IMPORTER_COUNT.REUSED_MAX });
  return importerCount.chain((count) =>
    fc.record({
      nodeDirectories: fc.uniqueArray(
        fc.tuple(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), SPEC_TREE_TEST_GENERATOR.sourceSlug()).map((
          [order, slug],
        ) => `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${KIND_REGISTRY.enabler.suffix}`),
        { minLength: SUPPORT_NODE_DIRECTORY_COUNT, maxLength: SUPPORT_NODE_DIRECTORY_COUNT },
      ),
      supportName: SPEC_TREE_TEST_GENERATOR.sourceSlug().map(evidenceSubject),
      importers: fc.uniqueArray(
        fc.record({
          subject: SPEC_TREE_TEST_GENERATOR.sourceSlug(),
          mode: fc.constantFrom(...SPEC_TREE_EVIDENCE_FILE.MODES),
          level: fc.constantFrom(...SPEC_TREE_EVIDENCE_FILE.LEVELS),
          node: fc.integer({ min: 0, max: SUPPORT_NODE_DIRECTORY_COUNT - 1 }),
        }),
        { minLength: count, maxLength: count, selector: (importer) => importer.subject },
      ),
    })
  ).map(({ nodeDirectories, supportName, importers }) => {
    const evidenceDirectory = (node: number): string =>
      [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeDirectories[node], SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME].join(
        SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
      );
    const nodeLocal = placement !== SUPPORT_PLACEMENT.TOP_LEVEL_REUSED;
    const supportModule = nodeLocal
      ? [evidenceDirectory(0), supportName].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)
      : [TOP_LEVEL_TEST_INFRASTRUCTURE.DIRECTORY, supportName].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
    const supportPath = `${supportModule}${SUPPORT_MODULE_EXTENSION}`;
    const importerFiles = importers.map(({ subject, mode, level, node }) => {
      const path = [
        evidenceDirectory(node),
        evidenceFileNameFor([evidenceSubject(subject), mode, level], SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT),
      ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
      const specifier = nodeLocal
        ? relativeSpecifier(posix.dirname(path), supportModule)
        : [TOP_LEVEL_TEST_INFRASTRUCTURE.ALIAS, supportName].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
      return { path, contents: `import { ${SUPPORT_EXPORT_NAME} } from "${specifier}";\n` };
    });
    const supportFile = { path: supportPath, contents: `export const ${SUPPORT_EXPORT_NAME} = "";\n` };
    return {
      files: [supportFile, ...importerFiles],
      reused: placement === SUPPORT_PLACEMENT.NODE_LOCAL_REUSED
        ? [{ supportPath, importers: importerFiles.map((file) => file.path).sort(compareAsciiStrings) }]
        : [],
    };
  });
}

function relativeSpecifier(fromDirectory: string, toModule: string): string {
  const relative = posix.relative(fromDirectory, toModule);
  return relative.startsWith(PARENT_DIRECTORY_SEGMENT) ? relative : `${RELATIVE_SPECIFIER_PREFIX}${relative}`;
}

export const SPEC_TREE_FIXTURES_TEST_GENERATOR = {
  escapingFixtureSlug: arbitraryEscapingFixtureSlug,
  containedFixtureSlug: arbitraryContainedFixtureSlug,
  fixtureWithEntrySlug: arbitraryFixtureWithEntrySlug,
  supportPlacementScenario: arbitrarySupportPlacementScenario,
} as const;
