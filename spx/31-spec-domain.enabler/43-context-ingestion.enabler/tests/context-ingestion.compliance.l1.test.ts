import { describe, it } from "vitest";

import {
  assertSpecContextIgnoresUnrelatedHarnessConfigDefects,
  assertSpecContextManifestCarriesSchemaVersionAndBootstrap,
  assertSpecContextManifestIgnoresUntrackedScratchNodes,
  assertSpecContextManifestIncludesMethodology,
  assertSpecContextManifestOmitsMissingNodeSpecs,
  assertSpecContextPrefersExactTarget,
  assertSpecContextRejectsAmbiguousTarget,
  assertSpecContextRejectsHarnessMethodologyConfig,
  assertSpecContextRejectsMalformedMethodologyConfig,
  assertSpecContextRejectsNestedWholePathDisambiguation,
  assertSpecContextTextIncludesContext,
  assertSpecContextUsesLinkedWorktreeRoot,
} from "@testing/harnesses/spec/context";

describe("spec context ingestion compliance", () => {
  it("prefers an exact node segment over another sibling that begins with it", async () => {
    await assertSpecContextPrefersExactTarget();
  });

  it("rejects ambiguous node-segment prefixes without selecting a candidate", async () => {
    await assertSpecContextRejectsAmbiguousTarget();
  });

  it("does not use a matching descendant to disambiguate an ambiguous ancestor", async () => {
    await assertSpecContextRejectsNestedWholePathDisambiguation();
  });

  it("includes configured methodology identity in the manifest", async () => {
    await assertSpecContextManifestIncludesMethodology();
  });

  it("carries the manifest schema version and the snapshot-derived bootstrap flag", async () => {
    await assertSpecContextManifestCarriesSchemaVersionAndBootstrap();
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
