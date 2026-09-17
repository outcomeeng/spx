import { posix } from "node:path";

import {
  RELEASE_CONTEXT_KIND,
  type ReleaseEndpointPathOwnership,
  type ReleaseProductContext,
} from "@/domains/release/product-context";
import type { ReleaseData } from "@/domains/release/release-data";
import { CHANGELOG_TITLE } from "@/domains/release/release-notes";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import fc from "fast-check";

import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "./release";

const CONTEXT_DECISION_INDEX = 10;
const CONTEXT_NODE_INDEX = 20;

export const RELEASE_OWNERSHIP_FIXTURE_CONTENT = {
  PRODUCT: "# Product\n",
  TYPESCRIPT_CONFIG: "{\"compilerOptions\":{}}\n",
} as const;

export const RELEASE_OWNERSHIP_COMMIT_SUBJECT = {
  EARLIER: "earlier ownership",
  OWNED_SOURCE: "owned source",
} as const;

export interface ReleaseOwnershipFixture {
  readonly productPath: string;
  readonly tsconfigPath: string;
  readonly sourcePath: string;
  readonly unlinkedTestPath: string;
}

export function sampleReleaseOwnershipFixture(): ReleaseOwnershipFixture {
  return {
    productPath: "spx/product.product.md",
    tsconfigPath: "tsconfig.json",
    sourcePath: "src/shared.ts",
    unlinkedTestPath: "tests/source.test.ts",
  };
}

export function releaseOwnershipNodeSpec(slug: string, testPath?: string, auditPath?: string): string {
  const assertions = [
    ...(testPath === undefined ? [] : [`- Given source input, behavior remains covered ([test](${testPath}))`]),
    ...(auditPath === undefined ? [] : [`- ALWAYS: \`${auditPath}\` is governed by this node ([audit])`]),
  ];
  return `# ${slug}\n\nPROVIDES ${slug}\nSO THAT products\nCAN release it\n\n## Assertions\n\n${
    assertions.join("\n")
  }\n`;
}

export function releaseOwnershipSourceImport(testPath: string): string {
  const depth = testPath.split("/").length - 1;
  return `import ${JSON.stringify(`${"../".repeat(depth)}src/shared`)};\n`;
}

export function releaseOwnershipSourceContent(value: number): string {
  return `export const value = ${value};\n`;
}

export interface ReleaseContextScenario {
  readonly documents: ReleaseProductContext;
  readonly product: ReleaseProductContext[number];
  readonly specification: ReleaseProductContext[number];
  readonly missingSpecificationPath: string;
  readonly subject: string;
  readonly body: string;
  readonly releaseData: ReleaseData;
  readonly existingNotes: string;
}

export interface ReleaseEndpointOwnershipScenario {
  readonly changedPaths: readonly string[];
  readonly endpointOwnership: readonly ReleaseEndpointPathOwnership[];
}

export const RELEASE_ENDPOINT_OWNERSHIP_CASE = {
  CROSS_ENDPOINT: "cross-endpoint",
  MULTIPLE_CANDIDATES: "multiple-candidates",
  DELETED: "deleted",
  UNRESOLVED: "unresolved",
} as const;

export type ReleaseEndpointOwnershipCase =
  (typeof RELEASE_ENDPOINT_OWNERSHIP_CASE)[keyof typeof RELEASE_ENDPOINT_OWNERSHIP_CASE];

export interface ReleaseEndpointRepositoryScenario {
  readonly kind: ReleaseEndpointOwnershipCase;
  readonly earlierNodeSlug: string;
  readonly laterNodeSlug: string;
  readonly parentNodeSlug: string;
  readonly childNodeSlug: string;
  readonly peerNodeSlug: string;
  readonly tag: string;
  readonly releaseData: ReleaseData;
}

export function arbitraryReleaseEndpointOwnershipScenario(): fc.Arbitrary<ReleaseEndpointOwnershipScenario> {
  return fc.record({
    path: arbitraryPathSegment().map((segment) => `src/${segment}.ts`),
    earlierCandidates: fc.uniqueArray(arbitraryPathSegment(), { maxLength: 3 }),
    laterCandidates: fc.uniqueArray(arbitraryPathSegment(), { maxLength: 3 }),
    earlierClassified: fc.boolean(),
    laterClassified: fc.boolean(),
  }).map(({ path, earlierCandidates, laterCandidates, earlierClassified, laterClassified }) => {
    const earlier = earlierClassified ? earlierCandidates : [];
    const later = laterClassified ? laterCandidates : [];
    const earlierGoverning = earlier.length > 1 ? `governing-earlier-${earlier[0]}` : undefined;
    const laterGoverning = later.length > 1 ? `governing-later-${later[0]}` : undefined;
    const endpointOwnership: readonly ReleaseEndpointPathOwnership[] = [
      {
        path,
        classifiedAsSource: earlierClassified,
        candidateNodeIds: earlier,
        ...(earlierGoverning === undefined ? {} : { governingNodeId: earlierGoverning }),
      },
      {
        path,
        classifiedAsSource: laterClassified,
        candidateNodeIds: later,
        ...(laterGoverning === undefined ? {} : { governingNodeId: laterGoverning }),
      },
    ];
    return {
      changedPaths: [path],
      endpointOwnership,
    };
  });
}

export function arbitraryReleaseEndpointRepositoryScenario(
  kind?: ReleaseEndpointOwnershipCase,
): fc.Arbitrary<ReleaseEndpointRepositoryScenario> {
  return fc.record({
    kind: kind === undefined ? fc.constantFrom(...Object.values(RELEASE_ENDPOINT_OWNERSHIP_CASE)) : fc.constant(kind),
    nodeSlugs: fc
      .tuple(
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
      )
      .filter((slugs) => new Set(slugs).size === slugs.length),
    tag: arbitraryPathSegment().map((segment) => `release-${segment}`),
    releaseData: RELEASE_TEST_GENERATOR.releaseData(),
  }).map(({ kind, nodeSlugs, tag, releaseData }) => ({
    kind,
    earlierNodeSlug: nodeSlugs[0],
    laterNodeSlug: nodeSlugs[1],
    parentNodeSlug: nodeSlugs[2],
    childNodeSlug: nodeSlugs[3],
    peerNodeSlug: nodeSlugs[4],
    tag,
    releaseData,
  }));
}

export function arbitraryReleaseContextScenario(): fc.Arbitrary<ReleaseContextScenario> {
  return fc.tuple(
    arbitraryPathSegment(),
    arbitraryPathSegment(),
    arbitraryPathSegment(),
    arbitraryPathSegment(),
    RELEASE_TEST_GENERATOR.releaseData(),
  ).map(([productName, capability, firstParagraph, secondParagraph, data]) => {
    const product = {
      kind: RELEASE_CONTEXT_KIND.PRODUCT,
      path: posix.join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, `${productName}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`),
      content: `# ${productName}\n\n${firstParagraph}\n`,
    };
    const decision = {
      kind: RELEASE_CONTEXT_KIND.DECISION,
      path: posix.join(
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        `${CONTEXT_DECISION_INDEX}-${capability}${KIND_REGISTRY.pdr.suffix}`,
      ),
      content: `# ${capability}\n\n${secondParagraph}\n`,
    };
    const specification = {
      kind: RELEASE_CONTEXT_KIND.SPECIFICATION,
      path: posix.join(
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        `${CONTEXT_NODE_INDEX}-${capability}${KIND_REGISTRY.enabler.suffix}`,
        `${capability}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
      ),
      content: `# ${capability}\n\n${firstParagraph}\n\n${secondParagraph}\n`,
    };
    const subject = `spec: ${capability}`;
    const body = `${firstParagraph}\n\n${secondParagraph}\n`;
    return {
      documents: [product, decision, specification],
      product,
      specification,
      missingSpecificationPath: `${specification.path}.${productName}`,
      subject,
      body,
      releaseData: {
        ...data,
        commits: data.commits.map((commit) => ({ ...commit, body })),
        changedPaths: [specification.path],
      },
      existingNotes: CHANGELOG_TITLE,
    };
  });
}

export function sampleReleaseContextScenario(): ReleaseContextScenario {
  return sampleReleaseTestValue(arbitraryReleaseContextScenario());
}
