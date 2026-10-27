import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  defaultMethodologyFetchFileSystem,
  formatMethodologyVersionName,
  METHODOLOGY_CODING_AGENTS,
  METHODOLOGY_RESOURCE_ENCODING,
  METHODOLOGY_TREE_ROOT,
  type MethodologySourceRecord,
  PACKAGING_FAILURE_KIND,
  parseMethodologySourceRecord,
  PLUGINS_REPOSITORY,
  runMethodologyFetch,
  SOURCE_RECORD_RELATIVE_PATH,
  validateMethodologyPackaging,
} from "@/lib/methodology";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { arbitraryMethodologyVersion, arbitraryPluginsContent } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  type PluginsRepository,
  recordWithMigration,
  withPluginsRepository,
} from "@testing/harnesses/methodology/plugins-repository";

/** A fetched line whose seeded migration assets and recorded source.json the packaging validation judges. */
async function fetchedRecord(
  repository: PluginsRepository,
  line: string,
): Promise<MethodologySourceRecord> {
  await repository.seedMigration(line);
  const outcome = await runMethodologyFetch({
    repository: PLUGINS_REPOSITORY,
    repositoryUrl: repository.repositoryDir,
    revision: repository.revision,
    packageRoot: repository.packageRoot,
    dependencies: repository.dependencies,
  });
  if (!outcome.ok) throw new Error(outcome.error);
  const record = parseMethodologySourceRecord(
    await readFile(
      join(repository.packageRoot, METHODOLOGY_TREE_ROOT, line, SOURCE_RECORD_RELATIVE_PATH),
      METHODOLOGY_RESOURCE_ENCODING,
    ),
  );
  if (!record.ok) throw new Error(record.error);
  return record.value;
}

describe("migration entry packaging compliance", () => {
  it("accepts the record of a fetched line whose entries and instructions are all present", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      const record = await fetchedRecord(repository, version.line);
      await expect(
        validateMethodologyPackaging(repository.packageRoot, version.line, record, defaultMethodologyFetchFileSystem),
      ).resolves.toEqual({ ok: true });
    });
  });

  it("fails naming the methodology version and the coding agent when its migration entry is absent", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      const record = await fetchedRecord(repository, version.line);
      for (const codingAgent of METHODOLOGY_CODING_AGENTS) {
        const result = await validateMethodologyPackaging(
          repository.packageRoot,
          version.line,
          recordWithMigration(record, codingAgent, { ...record.plugins[codingAgent].migration, entries: [] }),
          defaultMethodologyFetchFileSystem,
        );
        expect(result.ok, codingAgent).toBe(false);
        const failures = result.ok ? [] : result.failures;
        expect(failures.map((failure) => [failure.codingAgent, failure.kind])).toEqual([[
          codingAgent,
          PACKAGING_FAILURE_KIND.ABSENT,
        ]]);
        expect(failures[0]?.message).toContain(formatMethodologyVersionName(version.line));
        expect(failures[0]?.message).toContain(codingAgent);
      }
    });
  });

  it("fails naming the methodology version and the coding agent when its migration entry is duplicated", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      const record = await fetchedRecord(repository, version.line);
      for (const codingAgent of METHODOLOGY_CODING_AGENTS) {
        const [entry] = record.plugins[codingAgent].migration.entries;
        const result = await validateMethodologyPackaging(
          repository.packageRoot,
          version.line,
          recordWithMigration(record, codingAgent, {
            ...record.plugins[codingAgent].migration,
            entries: [entry, entry],
          }),
          defaultMethodologyFetchFileSystem,
        );
        expect(result.ok, codingAgent).toBe(false);
        const failures = result.ok ? [] : result.failures;
        expect(
          failures.some((failure) =>
            failure.codingAgent === codingAgent && failure.kind === PACKAGING_FAILURE_KIND.DUPLICATED
          ),
        ).toBe(true);
        const duplicated = failures.find((failure) => failure.kind === PACKAGING_FAILURE_KIND.DUPLICATED);
        expect(duplicated?.message).toContain(formatMethodologyVersionName(version.line));
        expect(duplicated?.message).toContain(codingAgent);
      }
    });
  });

  it("fails naming the methodology version and the coding agent when a recorded entry or instruction does not resolve to a file in its migration directory", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      const record = await fetchedRecord(repository, version.line);
      const missingName = `${sampleGeneratedValue(arbitraryPathSegment())}.md`;
      for (const codingAgent of METHODOLOGY_CODING_AGENTS) {
        const migration = record.plugins[codingAgent].migration;
        const [entry] = migration.entries;
        const missingPath = join(entry, "..", missingName).split("\\").join("/");
        const otherAgent = METHODOLOGY_CODING_AGENTS.find((candidate) => candidate !== codingAgent) ?? codingAgent;
        const foreignPath = record.plugins[otherAgent].migration.entries[0];
        for (
          const broken of [
            { ...migration, entries: [missingPath] },
            { ...migration, instructions: [...migration.instructions, missingPath] },
            { ...migration, entries: [foreignPath] },
          ]
        ) {
          const result = await validateMethodologyPackaging(
            repository.packageRoot,
            version.line,
            recordWithMigration(record, codingAgent, broken),
            defaultMethodologyFetchFileSystem,
          );
          expect(result.ok, `${codingAgent} ${JSON.stringify(broken)}`).toBe(false);
          const failures = result.ok ? [] : result.failures;
          const unresolvable = failures.find((failure) => failure.kind === PACKAGING_FAILURE_KIND.UNRESOLVABLE);
          expect(unresolvable?.codingAgent).toBe(codingAgent);
          expect(unresolvable?.message).toContain(formatMethodologyVersionName(version.line));
          expect(unresolvable?.message).toContain(codingAgent);
        }
      }
    });
  });

  it("fails the fetch naming the methodology version and the coding agent, and writes nothing, when a coding agent has no migration entry", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });
      expect(outcome.ok).toBe(false);
      for (const codingAgent of METHODOLOGY_CODING_AGENTS) {
        expect(outcome.ok ? "" : outcome.error).toContain(codingAgent);
      }
      expect(outcome.ok ? "" : outcome.error).toContain(formatMethodologyVersionName(version.line));
      await expect(
        defaultMethodologyFetchFileSystem.isFile(
          join(repository.packageRoot, METHODOLOGY_TREE_ROOT, version.line, SOURCE_RECORD_RELATIVE_PATH),
        ),
      ).resolves.toBe(false);
    });
  });
});
