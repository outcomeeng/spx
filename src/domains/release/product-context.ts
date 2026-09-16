import { encodeReleasePromptData } from "./prompt-data";
import type { ReleaseData } from "./release-data";

export const RELEASE_CONTEXT_KIND = {
  PRODUCT: "product",
  DECISION: "decision",
  SPECIFICATION: "specification",
} as const;

export interface ReleaseContextDocument {
  readonly kind: (typeof RELEASE_CONTEXT_KIND)[keyof typeof RELEASE_CONTEXT_KIND];
  readonly path: string;
  readonly content: string;
}

export type ReleaseProductContext = readonly ReleaseContextDocument[];

export interface ReleaseEndpointPathOwnership {
  readonly path: string;
  readonly classifiedAsSource: boolean;
  readonly candidateNodeIds: readonly string[];
  readonly governingNodeId?: string;
}

export interface ReleaseOwnershipContextSelection {
  readonly nodeIds: readonly string[];
  readonly unresolvedPaths: readonly string[];
}

export interface ReleaseSourceInput {
  readonly releaseData: ReleaseData;
  readonly productContext?: ReleaseProductContext;
}

export type ReleaseContextReader = (
  productDir: string,
  releaseData: ReleaseData,
) => Promise<ReleaseProductContext>;

export const RELEASE_SOURCE_DATA_BLOCK_OPEN = "<release-source>";
export const RELEASE_SOURCE_DATA_BLOCK_CLOSE = "</release-source>";

export function selectReleaseOwnershipContext(
  changedPaths: readonly string[],
  endpointOwnership: readonly ReleaseEndpointPathOwnership[],
): ReleaseOwnershipContextSelection {
  const nodeIds = new Set<string>();
  const unresolvedPaths: string[] = [];
  for (const path of changedPaths) {
    const endpointResults = endpointOwnership.filter((result) => result.path === path);
    if (!endpointResults.some((result) => result.classifiedAsSource)) continue;
    const resolved = endpointResults.filter((result) => result.candidateNodeIds.length > 0);
    if (resolved.length === 0) {
      unresolvedPaths.push(path);
      continue;
    }
    for (const result of resolved) {
      for (const candidateNodeId of result.candidateNodeIds) nodeIds.add(candidateNodeId);
      if (result.governingNodeId !== undefined) nodeIds.add(result.governingNodeId);
    }
  }
  return { nodeIds: [...nodeIds], unresolvedPaths };
}

export function formatReleaseSourceInput(input: ReleaseSourceInput): string {
  return [
    RELEASE_SOURCE_DATA_BLOCK_OPEN,
    encodeReleasePromptData({ productContext: input.productContext ?? [], releaseData: input.releaseData }),
    RELEASE_SOURCE_DATA_BLOCK_CLOSE,
  ].join("\n");
}
