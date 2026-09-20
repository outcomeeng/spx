import { posix } from "node:path";

import {
  RELEASE_CONTEXT_KIND,
  type ReleaseEndpointPathOwnership,
  type ReleaseProductContext,
} from "@/domains/release/product-context";
import type { ReleaseData } from "@/domains/release/release-data";
import { CHANGELOG_TITLE } from "@/domains/release/release-notes";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { arbitraryConformantChangelog } from "@testing/generators/release/changelog";
import fc from "fast-check";

import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "./release";

const CONTEXT_DECISION_INDEX = 10;
const CONTEXT_NODE_INDEX = 20;

export const RELEASE_OWNERSHIP_FIXTURE_CONTENT = {
  PRODUCT: "# Product\n",
  TYPESCRIPT_CONFIG: "{\"compilerOptions\":{}}\n",
} as const;

export interface ReleaseOwnershipFixture {
  readonly productPath: string;
  readonly tsconfigPath: string;
  readonly sourcePath: string;
  readonly unlinkedTestPath: string;
}

export function sampleReleaseOwnershipFixture(): ReleaseOwnershipFixture {
  const evidenceFilename = [
    "source",
    SPEC_TREE_GRAMMAR.EVIDENCE.MODES[0],
    SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS[0],
    ...SPEC_TREE_GRAMMAR.EVIDENCE.TAILS.TYPESCRIPT,
  ].join(SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR);
  return {
    productPath: posix.join(
      SPEC_TREE_CONFIG.ROOT_DIRECTORY,
      `product${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
    ),
    tsconfigPath: TYPESCRIPT_MARKER,
    sourcePath: "src/shared.ts",
    unlinkedTestPath: posix.join(SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME, evidenceFilename),
  };
}

/** A root decision whose one audit rule claims the given path for the product. */
export function releaseOwnershipRootDecision(slug: string, auditPath: string): string {
  return `# ${slug}\n\nWE BELIEVE THAT products own their shared source\n\n## Verification\n\n### Audit\n\n- ALWAYS: \`${auditPath}\` is governed by the product ([audit])\n`;
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

export function releaseOwnershipSourceImport(testPath: string, sourcePath: string): string {
  const sourceExtension = `.${SPEC_TREE_GRAMMAR.EVIDENCE.TAILS.TYPESCRIPT.at(-1)}`;
  const relativeSourcePath = posix.relative(posix.dirname(testPath), sourcePath);
  const extensionlessPath = relativeSourcePath.endsWith(sourceExtension)
    ? relativeSourcePath.slice(0, -sourceExtension.length)
    : relativeSourcePath;
  const importPath = extensionlessPath.startsWith(".") ? extensionlessPath : `./${extensionlessPath}`;
  return `import ${JSON.stringify(importPath)};\n`;
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
  readonly generatedNotes: string;
}

export interface ReleaseEndpointOwnershipScenario {
  readonly changedPaths: readonly string[];
  readonly endpointOwnership: readonly ReleaseEndpointPathOwnership[];
  /** The node identities the generator placed as candidates or governing owners at a classified endpoint. */
  readonly expectedNodeIds: readonly string[];
  /** The changed paths the generator classified as source at some endpoint while placing no owner at any. */
  readonly expectedUnresolvedPaths: readonly string[];
}

export const RELEASE_ENDPOINT_OWNERSHIP_CASE = {
  AUDIT_DECLARATION: "audit-declaration",
  ROOT_DECISION: "root-decision",
  CROSS_ENDPOINT: "cross-endpoint",
  MULTIPLE_CANDIDATES: "multiple-candidates",
  DELETED: "deleted",
  UNRESOLVED: "unresolved",
} as const;

export type ReleaseEndpointOwnershipCase =
  (typeof RELEASE_ENDPOINT_OWNERSHIP_CASE)[keyof typeof RELEASE_ENDPOINT_OWNERSHIP_CASE];

export interface ReleaseEndpointFile {
  readonly path: string;
  readonly content: string;
}

export interface ReleaseEndpointSource {
  readonly ref: string;
  readonly files: readonly ReleaseEndpointFile[];
}

export interface ReleaseEndpointSourceScenario {
  readonly kind: ReleaseEndpointOwnershipCase;
  readonly endpoints: readonly ReleaseEndpointSource[];
  readonly expectedContextPaths: readonly string[];
  readonly changedSourcePath: string;
  readonly releaseData: ReleaseData;
}

export interface ReleaseOwnershipNodePaths {
  readonly slug: string;
  readonly nodeId: string;
  readonly specificationPath: string;
  readonly testPath: string;
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
    const placedOwners = [
      ...earlier,
      ...(earlierGoverning === undefined ? [] : [earlierGoverning]),
      ...later,
      ...(laterGoverning === undefined ? [] : [laterGoverning]),
    ];
    const classifiedSomewhere = earlierClassified || laterClassified;
    return {
      changedPaths: [path],
      endpointOwnership,
      expectedNodeIds: [...new Set(placedOwners)],
      expectedUnresolvedPaths: classifiedSomewhere && placedOwners.length === 0 ? [path] : [],
    };
  });
}

export function arbitraryReleaseEndpointSourceScenario(
  kind?: ReleaseEndpointOwnershipCase,
): fc.Arbitrary<ReleaseEndpointSourceScenario> {
  return fc.record({
    kind: kind === undefined ? fc.constantFrom(...Object.values(RELEASE_ENDPOINT_OWNERSHIP_CASE)) : fc.constant(kind),
    nodeSlugs: fc
      .tuple(
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
        arbitraryPathSegment(),
      )
      .filter((slugs) => new Set(slugs).size === slugs.length),
    sourceSlug: arbitraryPathSegment(),
    tag: arbitraryPathSegment().map((segment) => `release-${segment}`),
    releaseData: RELEASE_TEST_GENERATOR.releaseData(),
  }).map(({ kind, nodeSlugs, sourceSlug, tag, releaseData }) => {
    const earlierNode = releaseOwnershipNodePaths(nodeSlugs[0], 20);
    const laterNode = releaseOwnershipNodePaths(nodeSlugs[1], 30);
    const parentNode = releaseOwnershipNodePaths(nodeSlugs[2], 20);
    const childNode = releaseOwnershipNodePaths(nodeSlugs[3], 20, parentNode.nodeId);
    const peerNode = releaseOwnershipNodePaths(nodeSlugs[4], 30, parentNode.nodeId);
    const productPath = posix.join(
      SPEC_TREE_CONFIG.ROOT_DIRECTORY,
      `${nodeSlugs[5]}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
    );
    const rootDecisionPath = posix.join(
      SPEC_TREE_CONFIG.ROOT_DIRECTORY,
      `${CONTEXT_DECISION_INDEX}-${nodeSlugs[0]}${KIND_REGISTRY.adr.suffix}`,
    );
    const changedSourcePath = `src/${sourceSlug}.ts`;
    const unlinkedTestPath = releaseOwnershipTestPath(sourceSlug);
    const currentFiles = releaseEndpointFiles(productPath, nodeSlugs[5]);
    const earlierFiles = releaseEndpointFiles(productPath, nodeSlugs[5]);
    const expectedContextPaths = kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.CROSS_ENDPOINT
      ? [earlierNode.specificationPath, laterNode.specificationPath]
      : kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.MULTIPLE_CANDIDATES
      ? [parentNode.specificationPath, childNode.specificationPath, peerNode.specificationPath]
      : kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED
      ? []
      : kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.ROOT_DECISION
      ? [rootDecisionPath]
      : [earlierNode.specificationPath];
    switch (kind) {
      case RELEASE_ENDPOINT_OWNERSHIP_CASE.AUDIT_DECLARATION:
        currentFiles.push(
          releaseEndpointFile(
            earlierNode.specificationPath,
            releaseOwnershipNodeSpec(earlierNode.slug, undefined, changedSourcePath),
          ),
          releaseEndpointFile(unlinkedTestPath, releaseOwnershipSourceImport(unlinkedTestPath, changedSourcePath)),
          releaseEndpointFile(changedSourcePath, releaseOwnershipSourceContent(1)),
        );
        break;
      case RELEASE_ENDPOINT_OWNERSHIP_CASE.ROOT_DECISION:
        currentFiles.push(
          releaseEndpointFile(rootDecisionPath, releaseOwnershipRootDecision(nodeSlugs[0], changedSourcePath)),
          releaseEndpointFile(unlinkedTestPath, releaseOwnershipSourceImport(unlinkedTestPath, changedSourcePath)),
          releaseEndpointFile(changedSourcePath, releaseOwnershipSourceContent(1)),
        );
        break;
      case RELEASE_ENDPOINT_OWNERSHIP_CASE.CROSS_ENDPOINT:
        addOwnedSource(currentFiles, laterNode, changedSourcePath, 2);
        addOwnedSource(earlierFiles, earlierNode, changedSourcePath, 1);
        break;
      case RELEASE_ENDPOINT_OWNERSHIP_CASE.MULTIPLE_CANDIDATES:
        currentFiles.push(releaseEndpointFile(parentNode.specificationPath, releaseOwnershipNodeSpec(parentNode.slug)));
        addOwnedNode(currentFiles, childNode, changedSourcePath);
        addOwnedNode(currentFiles, peerNode, changedSourcePath);
        currentFiles.push(releaseEndpointFile(changedSourcePath, releaseOwnershipSourceContent(1)));
        break;
      case RELEASE_ENDPOINT_OWNERSHIP_CASE.DELETED:
        currentFiles.push(
          releaseEndpointFile(earlierNode.specificationPath, releaseOwnershipNodeSpec(earlierNode.slug)),
        );
        addOwnedSource(earlierFiles, earlierNode, changedSourcePath, 1);
        break;
      case RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED:
        for (const files of [currentFiles, earlierFiles]) {
          files.push(
            releaseEndpointFile(unlinkedTestPath, releaseOwnershipSourceImport(unlinkedTestPath, changedSourcePath)),
            releaseEndpointFile(changedSourcePath, releaseOwnershipSourceContent(1)),
          );
        }
        break;
    }
    const previousTag = kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.MULTIPLE_CANDIDATES
        || kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.AUDIT_DECLARATION
        || kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.ROOT_DECISION
      ? null
      : tag;
    return {
      kind,
      endpoints: [
        { ref: releaseData.releaseRef, files: currentFiles },
        ...(previousTag === null ? [] : [{ ref: previousTag, files: earlierFiles }]),
      ],
      expectedContextPaths,
      changedSourcePath,
      releaseData: { ...releaseData, previousTag, changedPaths: [changedSourcePath] },
    };
  });
}

function releaseEndpointFiles(productPath: string, productName: string): ReleaseEndpointFile[] {
  return [
    releaseEndpointFile(productPath, `# ${productName}\n`),
    releaseEndpointFile(TYPESCRIPT_MARKER, RELEASE_OWNERSHIP_FIXTURE_CONTENT.TYPESCRIPT_CONFIG),
  ];
}

function releaseEndpointFile(path: string, content: string): ReleaseEndpointFile {
  return { path, content };
}

function addOwnedSource(
  files: ReleaseEndpointFile[],
  node: ReleaseOwnershipNodePaths,
  sourcePath: string,
  sourceValue: number,
): void {
  addOwnedNode(files, node, sourcePath);
  files.push(releaseEndpointFile(sourcePath, releaseOwnershipSourceContent(sourceValue)));
}

function addOwnedNode(
  files: ReleaseEndpointFile[],
  node: ReleaseOwnershipNodePaths,
  sourcePath: string,
): void {
  files.push(
    releaseEndpointFile(
      node.specificationPath,
      releaseOwnershipNodeSpec(node.slug, node.testPath.slice(node.nodeId.length + 1)),
    ),
    releaseEndpointFile(node.testPath, releaseOwnershipSourceImport(node.testPath, sourcePath)),
  );
}

function releaseOwnershipTestPath(slug: string): string {
  return posix.join(
    SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME,
    [
      slug,
      SPEC_TREE_GRAMMAR.EVIDENCE.MODES[0],
      SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS[0],
      ...SPEC_TREE_GRAMMAR.EVIDENCE.TAILS.TYPESCRIPT,
    ].join(SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR),
  );
}

function releaseOwnershipNodePaths(
  slug: string,
  index: number,
  parentId: string = SPEC_TREE_CONFIG.ROOT_DIRECTORY,
): ReleaseOwnershipNodePaths {
  const nodeId = posix.join(
    parentId,
    `${index}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${KIND_REGISTRY.enabler.suffix}`,
  );
  const evidenceFilename = [
    slug,
    SPEC_TREE_GRAMMAR.EVIDENCE.MODES[0],
    SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS[0],
    ...SPEC_TREE_GRAMMAR.EVIDENCE.TAILS.TYPESCRIPT,
  ].join(SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR);
  return {
    slug,
    nodeId,
    specificationPath: posix.join(nodeId, `${slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`),
    testPath: posix.join(nodeId, SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME, evidenceFilename),
  };
}

export function arbitraryReleaseContextScenario(): fc.Arbitrary<ReleaseContextScenario> {
  return fc.tuple(
    arbitraryPathSegment(),
    arbitraryPathSegment(),
    arbitraryPathSegment(),
    arbitraryPathSegment(),
    RELEASE_TEST_GENERATOR.releaseData(),
  ).chain(([productName, capability, firstParagraph, secondParagraph, data]) => {
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
    const releaseData = {
      ...data,
      commits: data.commits.map((commit) => ({ ...commit, body })),
      changedPaths: [specification.path],
    };
    return arbitraryConformantChangelog(
      releaseData.version,
      releaseData.commits.map(({ subject: commitSubject }) => commitSubject),
    ).map((generatedNotes) => ({
      documents: [product, decision, specification],
      product,
      specification,
      missingSpecificationPath: `${specification.path}.${productName}`,
      subject,
      body,
      releaseData,
      existingNotes: CHANGELOG_TITLE,
      generatedNotes,
    }));
  });
}

export function sampleReleaseContextScenario(): ReleaseContextScenario {
  return sampleReleaseTestValue(arbitraryReleaseContextScenario());
}
