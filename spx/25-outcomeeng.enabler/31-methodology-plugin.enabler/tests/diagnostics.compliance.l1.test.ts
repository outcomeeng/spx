import { describe, expect, it } from "vitest";

import {
  checkProviderMatch,
  defaultMethodologyTreeFileSystem,
  formatMethodologyVersionName,
  METHODOLOGY_CODING_AGENT,
  PLUGINS_REPOSITORY,
  resolveMethodologyTree,
  runMethodologyFetch,
} from "@/lib/methodology";
import {
  arbitraryDisagreeingPluginsContent,
  arbitraryDistinctCodingAgentNames,
  arbitraryMethodologyVersionsOnDistinctLines,
  arbitraryPluginsContent,
  generatedSourceRecordProviding,
  supportsRangeExcluding,
} from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withPluginsRepository } from "@testing/harnesses/methodology/plugins-repository";
import { withShippedTreeRoot } from "@testing/harnesses/methodology/tree-root";

// Every case declares patched versions, so a diagnostic that echoes a declared
// version verbatim or speaks of a "line" fails; the expected `methodology
// <MAJOR.MINOR>` names come from the generator's own construction.
describe("shipped-methodology diagnostics name versions as methodology <MAJOR.MINOR>", () => {
  it("a read for a version spx does not ship names it and every shipped version that way", async () => {
    const [declared, shipped] = sampleGeneratedValue(arbitraryMethodologyVersionsOnDistinctLines());
    const [codingAgent] = sampleGeneratedValue(arbitraryDistinctCodingAgentNames());
    await withShippedTreeRoot({ [shipped.line]: { codingAgents: [codingAgent] } }, async (treeRoot) => {
      const read = await resolveMethodologyTree({
        treeRoot,
        version: declared.text,
        codingAgent,
        fs: defaultMethodologyTreeFileSystem,
      });

      expect(read.ok).toBe(false);
      const diagnostic = read.ok ? "" : read.error;
      expect(diagnostic).toContain(formatMethodologyVersionName(declared.line));
      expect(diagnostic).toContain(formatMethodologyVersionName(shipped.line));
      expect(diagnostic).not.toContain(declared.text);
      expect(diagnostic).not.toMatch(/\blines?\b/i);
    });
  });

  it("a read for a coding agent the version ships no tree for names the version and the shipped coding agents", async () => {
    const [declared] = sampleGeneratedValue(arbitraryMethodologyVersionsOnDistinctLines());
    const [shippedAgent, requestedAgent] = sampleGeneratedValue(arbitraryDistinctCodingAgentNames());
    await withShippedTreeRoot({ [declared.line]: { codingAgents: [shippedAgent] } }, async (treeRoot) => {
      const read = await resolveMethodologyTree({
        treeRoot,
        version: declared.text,
        codingAgent: requestedAgent,
        fs: defaultMethodologyTreeFileSystem,
      });

      expect(read.ok).toBe(false);
      const diagnostic = read.ok ? "" : read.error;
      expect(diagnostic).toContain(formatMethodologyVersionName(declared.line));
      expect(diagnostic).toContain(shippedAgent);
      expect(diagnostic).toContain(requestedAgent);
      expect(diagnostic).not.toContain(declared.text);
      expect(diagnostic).not.toMatch(/\blines?\b/i);
    });
  });

  it("a read naming no coding agent where the version ships several names the version and its coding agents", async () => {
    const [declared] = sampleGeneratedValue(arbitraryMethodologyVersionsOnDistinctLines());
    const codingAgents = sampleGeneratedValue(arbitraryDistinctCodingAgentNames());
    await withShippedTreeRoot({ [declared.line]: { codingAgents } }, async (treeRoot) => {
      const read = await resolveMethodologyTree({
        treeRoot,
        version: declared.text,
        codingAgent: undefined,
        fs: defaultMethodologyTreeFileSystem,
      });

      expect(read.ok).toBe(false);
      const diagnostic = read.ok ? "" : read.error;
      expect(diagnostic).toContain(formatMethodologyVersionName(declared.line));
      for (const codingAgent of codingAgents) expect(diagnostic).toContain(codingAgent);
      expect(diagnostic).not.toContain(declared.text);
      expect(diagnostic).not.toMatch(/\blines?\b/i);
    });
  });

  it("a provider declaration for another version names the declared and the provided version that way", () => {
    const [declared, provided] = sampleGeneratedValue(arbitraryMethodologyVersionsOnDistinctLines());

    const match = checkProviderMatch({
      version: declared.text,
      codingAgent: METHODOLOGY_CODING_AGENT.CLAUDE,
      sourceRecord: generatedSourceRecordProviding(provided.text),
    });

    expect(match.ok).toBe(false);
    const diagnostic = match.ok ? "" : match.error;
    expect(diagnostic).toContain(formatMethodologyVersionName(declared.line));
    expect(diagnostic).toContain(formatMethodologyVersionName(provided.line));
    expect(diagnostic).not.toContain(declared.text);
    expect(diagnostic).not.toContain(provided.text);
    expect(diagnostic).not.toMatch(/\blines?\b/i);
  });

  it("a migration source outside the supported range is named that way while the range keeps its declared text", () => {
    const [declared, migratingFrom] = sampleGeneratedValue(arbitraryMethodologyVersionsOnDistinctLines());
    const supports = supportsRangeExcluding(migratingFrom.text);

    const match = checkProviderMatch({
      version: declared.text,
      migratingFrom: migratingFrom.text,
      codingAgent: METHODOLOGY_CODING_AGENT.CLAUDE,
      sourceRecord: generatedSourceRecordProviding(declared.text, supports),
    });

    expect(match.ok).toBe(false);
    const diagnostic = match.ok ? "" : match.error;
    expect(diagnostic).toContain(supports);
    expect(diagnostic).toContain(formatMethodologyVersionName(migratingFrom.line));
    expect(diagnostic.replace(supports, "")).not.toContain(migratingFrom.text);
    expect(diagnostic).not.toMatch(/\blines?\b/i);
  });

  it("a fetch whose plugin manifests disagree names each provided version that way", async () => {
    const content = sampleGeneratedValue(arbitraryDisagreeingPluginsContent());
    await withPluginsRepository(content, async (repository) => {
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });

      expect(outcome.ok).toBe(false);
      const diagnostic = outcome.ok ? "" : outcome.error;
      for (const provided of content.provided) {
        expect(diagnostic).toContain(formatMethodologyVersionName(provided.line));
        expect(diagnostic).not.toContain(provided.text);
      }
      expect(diagnostic).not.toMatch(/\blines?\b/i);
    });
  });

  it("a fetch naming a version other than the one the manifests provide names both versions that way", async () => {
    const [provided, named] = sampleGeneratedValue(arbitraryMethodologyVersionsOnDistinctLines());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(provided.text)), async (repository) => {
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        line: named.line,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });

      expect(outcome.ok).toBe(false);
      const diagnostic = outcome.ok ? "" : outcome.error;
      expect(diagnostic).toContain(formatMethodologyVersionName(named.line));
      expect(diagnostic).toContain(formatMethodologyVersionName(provided.line));
      expect(diagnostic).not.toContain(provided.text);
      expect(diagnostic).not.toMatch(/\blines?\b/i);
    });
  });
});
