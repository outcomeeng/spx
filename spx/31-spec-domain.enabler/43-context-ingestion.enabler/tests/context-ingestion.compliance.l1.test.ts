import { describe, it } from "vitest";

import {
  assertSpecContextIgnoresUnrelatedHarnessConfigDefects,
  assertSpecContextManifestIgnoresUntrackedScratchNodes,
  assertSpecContextManifestIncludesDocuments,
  assertSpecContextManifestIncludesMethodology,
  assertSpecContextManifestListsSameAndHigherSiblings,
  assertSpecContextManifestOmitsMissingNodeSpecs,
  assertSpecContextRejectsAmbiguousTarget,
  assertSpecContextRejectsArtifactTarget,
  assertSpecContextRejectsHarnessMethodologyConfig,
  assertSpecContextRejectsMalformedMethodologyConfig,
  assertSpecContextResolvesAbbreviatedTarget,
  assertSpecContextTextIncludesContext,
  assertSpecContextUsesLinkedWorktreeRoot,
} from "@testing/harnesses/spec/context";

describe("spec context ingestion compliance", () => {
  it("resolves unique node-segment prefixes and trailing separators", async () => {
    await assertSpecContextResolvesAbbreviatedTarget();
  });

  it("rejects ambiguous node-segment prefixes without selecting a candidate", async () => {
    await assertSpecContextRejectsAmbiguousTarget();
  });

  it("rejects artifact paths with an owning-node diagnostic", async () => {
    await assertSpecContextRejectsArtifactTarget();
  });

  it("includes configured methodology identity in the manifest", async () => {
    await assertSpecContextManifestIncludesMethodology();
  });

  it("includes deterministic spec-tree documents in the manifest", async () => {
    await assertSpecContextManifestIncludesDocuments();
  });

  it("lists same-index and higher-index siblings separately", async () => {
    await assertSpecContextManifestListsSameAndHigherSiblings();
  });

  it("excludes untracked node-shaped scratch paths from the manifest", async () => {
    await assertSpecContextManifestIgnoresUntrackedScratchNodes();
  });

  it("reads tracked context from the linked worktree root", async () => {
    await assertSpecContextUsesLinkedWorktreeRoot();
  });

  it("omits missing node spec paths from the manifest", async () => {
    await assertSpecContextManifestOmitsMissingNodeSpecs();
  });

  it("renders deterministic spec-tree context as text", async () => {
    await assertSpecContextTextIncludesContext();
  });

  it("rejects malformed methodology config before manifest output", async () => {
    await assertSpecContextRejectsMalformedMethodologyConfig();
  });

  it("rejects stale harness methodology config before manifest output", async () => {
    await assertSpecContextRejectsHarnessMethodologyConfig();
  });

  it("ignores unrelated harness config defects when resolving methodology context", async () => {
    await assertSpecContextIgnoresUnrelatedHarnessConfigDefects();
  });
});
