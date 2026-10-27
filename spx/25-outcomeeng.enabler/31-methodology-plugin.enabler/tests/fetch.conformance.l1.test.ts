import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FOUNDATION_PLUGIN_NAME,
  INSTRUCTION_TEMPLATE_RELATIVE_PATH,
  METHODOLOGY_RESOURCE_ENCODING,
  METHODOLOGY_TREE_ROOT,
  parseMethodologySourceRecord,
  PLUGINS_REPOSITORY,
  runMethodologyFetch,
  SOURCE_RECORD_RELATIVE_PATH,
  UNDERSTAND_SKILL_RELATIVE_DIR,
} from "@/lib/methodology";
import { arbitraryMethodologyVersion, arbitraryPluginsContent } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withPluginsRepository } from "@testing/harnesses/methodology/plugins-repository";

describe("methodology fetch conformance", () => {
  it("holds each coding agent's understand skill exactly as the plugins repository publishes it at the revision", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      await repository.seedMigration(version.line);
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });
      expect(outcome).toMatchObject({ ok: true, value: { line: version.line, revision: repository.revision } });
      for (const [codingAgent, agentContent] of repository.content.agents) {
        for (const [relativePath, text] of agentContent.skillFiles) {
          await expect(readFile(
            join(
              repository.packageRoot,
              METHODOLOGY_TREE_ROOT,
              version.line,
              codingAgent,
              FOUNDATION_PLUGIN_NAME,
              UNDERSTAND_SKILL_RELATIVE_DIR,
              relativePath,
            ),
            METHODOLOGY_RESOURCE_ENCODING,
          )).resolves.toBe(text);
        }
      }
    });
  });

  it("records the repository, the commit a branch revision resolves to, and each agent's plugin identity in source.json", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      await repository.seedMigration(version.line);
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.branch,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });
      expect(outcome.ok).toBe(true);
      const record = parseMethodologySourceRecord(
        await readFile(
          join(repository.packageRoot, METHODOLOGY_TREE_ROOT, version.line, SOURCE_RECORD_RELATIVE_PATH),
          METHODOLOGY_RESOURCE_ENCODING,
        ),
      );
      expect(record.ok).toBe(true);
      const recorded = record.ok ? record.value : undefined;
      expect({
        repository: recorded?.repository,
        revision: recorded?.revision,
        plugins: Object.fromEntries(
          Object.entries(recorded?.plugins ?? {}).map(([codingAgent, plugin]) => [codingAgent, {
            name: plugin.name,
            version: plugin.version,
            provides: plugin.provides,
            supports: plugin.supports,
          }]),
        ),
      }).toEqual({
        repository: PLUGINS_REPOSITORY,
        revision: repository.revision,
        plugins: Object.fromEntries(
          [...repository.content.agents].map(([codingAgent, agentContent]) => [codingAgent, {
            name: agentContent.pluginName,
            version: agentContent.pluginVersion,
            provides: agentContent.provides,
            supports: agentContent.supports,
          }]),
        ),
      });
    });
  });

  it("records the instruction-template version the builds carry with the template's repository, path, and resolved commit", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      await repository.seedMigration(version.line);
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.branch,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });
      expect(outcome.ok).toBe(true);
      const record = parseMethodologySourceRecord(
        await readFile(
          join(repository.packageRoot, METHODOLOGY_TREE_ROOT, version.line, SOURCE_RECORD_RELATIVE_PATH),
          METHODOLOGY_RESOURCE_ENCODING,
        ),
      );
      expect(record.ok).toBe(true);
      expect(record.ok ? record.value.template : undefined).toEqual({
        version: [...repository.content.agents.values()][0].templateVersion,
        repository: PLUGINS_REPOSITORY,
        path: INSTRUCTION_TEMPLATE_RELATIVE_PATH,
        commit: repository.revision,
      });
      expect(record.ok ? record.value.template.version : undefined).not.toBe(
        [...repository.content.agents.values()][0].pluginVersion,
      );
      expect(record.ok ? record.value.template.version : undefined).not.toBe(version.text);
    });
  });
});
