import { RELEASE_CONTEXT_KIND, type ReleaseProductContext } from "@/domains/release/product-context";

/** A small product whose shipped behavior is itself publication tooling. */
export const RELEASE_CONTEXT_FIXTURE = {
  product: {
    kind: RELEASE_CONTEXT_KIND.PRODUCT,
    path: "spx/publisher.product.md",
    content: "# Publisher\n\nPublishes provenance-bearing packages for release automation.\n",
  },
  decision: {
    kind: RELEASE_CONTEXT_KIND.DECISION,
    path: "spx/10-publication.pdr.md",
    content: "# Publication\n\nRegistry propagation delays preserve an existing publication.\n",
  },
  specification: {
    kind: RELEASE_CONTEXT_KIND.SPECIFICATION,
    path: "spx/20-publication.enabler/publication.md",
    content: "# Publication\n\nPROVIDES resumable publication\nSO THAT automation\nCAN retry safely\n",
  },
  subject: "spec: define safe publication retries",
  body: "Release automation consumes this command.\n\nA retry preserves the already-published package.\n",
} as const;

export const RELEASE_CONTEXT_DOCUMENTS: ReleaseProductContext = [
  RELEASE_CONTEXT_FIXTURE.product,
  RELEASE_CONTEXT_FIXTURE.decision,
  RELEASE_CONTEXT_FIXTURE.specification,
];
