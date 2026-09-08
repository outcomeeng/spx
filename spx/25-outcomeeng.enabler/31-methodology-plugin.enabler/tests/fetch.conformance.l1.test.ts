import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FOUNDATION_PLUGIN_NAME,
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
      expect(record).toEqual({
        ok: true,
        value: {
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
        },
      });
    });
  });
});
