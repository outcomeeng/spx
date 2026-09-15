import { posix } from "node:path";

import { RELEASE_CONTEXT_KIND, type ReleaseProductContext } from "@/domains/release/product-context";
import type { ReleaseData } from "@/domains/release/release-data";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import fc from "fast-check";

import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "./release";

const CONTEXT_DECISION_INDEX = 10;
const CONTEXT_NODE_INDEX = 20;

export interface ReleaseContextScenario {
  readonly documents: ReleaseProductContext;
  readonly product: ReleaseProductContext[number];
  readonly specification: ReleaseProductContext[number];
  readonly missingSpecificationPath: string;
  readonly subject: string;
  readonly body: string;
  readonly releaseData: ReleaseData;
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
    };
  });
}

export function sampleReleaseContextScenario(): ReleaseContextScenario {
  return sampleReleaseTestValue(arbitraryReleaseContextScenario());
}
