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

export interface ReleaseSourceInput {
  readonly releaseData: ReleaseData;
  readonly productContext?: ReleaseProductContext;
}

export type ReleaseContextReader = (
  productDir: string,
  changedPaths: readonly string[],
) => Promise<ReleaseProductContext>;

export const RELEASE_SOURCE_DATA_BLOCK_OPEN = "<release-source>";
export const RELEASE_SOURCE_DATA_BLOCK_CLOSE = "</release-source>";
