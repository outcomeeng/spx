import { describe, it } from "vitest";

import {
  assertSpecContextManifestIncludesDocuments,
  assertSpecContextManifestIncludesMethodology,
  assertSpecContextRejectsMalformedMethodologyConfig,
} from "@testing/harnesses/spec/context";

describe("spec context ingestion scenarios", () => {
  it("includes configured methodology identity in the manifest", async () => {
    await assertSpecContextManifestIncludesMethodology();
  });

  it("includes deterministic spec-tree documents in the manifest", async () => {
    await assertSpecContextManifestIncludesDocuments();
  });

  it("rejects malformed methodology config before manifest output", async () => {
    await assertSpecContextRejectsMalformedMethodologyConfig();
  });
});
