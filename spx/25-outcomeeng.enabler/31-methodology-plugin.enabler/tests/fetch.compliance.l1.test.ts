import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FETCH_ARGUMENT_FLAGS,
  METHODOLOGY_RESOURCE_ENCODING,
  METHODOLOGY_TREE_ROOT,
  PLUGINS_REPOSITORY,
  runMethodologyFetch,
} from "@/lib/methodology";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import {
  arbitraryDisagreeingPluginsContent,
  arbitraryMarkdownBody,
  arbitraryMethodologyLine,
  arbitraryMethodologyVersion,
  arbitraryPluginsContent,
  arbitraryUnsafeTreeSegment,
} from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withPluginsRepository } from "@testing/harnesses/methodology/plugins-repository";

describe("methodology fetch compliance", () => {
  it("replaces the whole target line directory and writes nothing outside it", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(version.text)), async (repository) => {
      const staleName = sampleGeneratedValue(arbitraryPathSegment());
      const bystanderText = sampleGeneratedValue(arbitraryMarkdownBody());
      const stalePath = join(repository.packageRoot, METHODOLOGY_TREE_ROOT, version.line, staleName);
      const otherLinePath = join(
        repository.packageRoot,
        METHODOLOGY_TREE_ROOT,
        sampleGeneratedValue(arbitraryMethodologyLine().filter((line) => line !== version.line)),
        staleName,
      );
      const rootPath = join(repository.packageRoot, staleName);
      for (const path of [stalePath, otherLinePath, rootPath]) {
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, bystanderText);
      }

      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });

      expect(outcome.ok).toBe(true);
      await expect(access(stalePath)).rejects.toThrow();
      await expect(readFile(otherLinePath, METHODOLOGY_RESOURCE_ENCODING)).resolves.toBe(bystanderText);
      await expect(readFile(rootPath, METHODOLOGY_RESOURCE_ENCODING)).resolves.toBe(bystanderText);
    });
  });

  it("requires the line argument when no fetched plugin manifest declares what it provides", async () => {
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent()), async (repository) => {
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? "" : outcome.error).toContain(FETCH_ARGUMENT_FLAGS.LINE);
      await expect(readdir(join(repository.packageRoot, METHODOLOGY_TREE_ROOT))).rejects.toThrow();
    });
  });

  it("takes the line from the argument when no manifest declares one", async () => {
    const line = sampleGeneratedValue(arbitraryMethodologyLine());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent()), async (repository) => {
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        line,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });
      expect(outcome).toMatchObject({ ok: true, value: { line } });
      await expect(readdir(join(repository.packageRoot, METHODOLOGY_TREE_ROOT))).resolves.toEqual([line]);
    });
  });

  it("fails when the coding agents' manifests disagree on the line they provide", async () => {
    await withPluginsRepository(sampleGeneratedValue(arbitraryDisagreeingPluginsContent()), async (repository) => {
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });
      expect(outcome.ok).toBe(false);
      await expect(readdir(join(repository.packageRoot, METHODOLOGY_TREE_ROOT))).rejects.toThrow();
    });
  });

  it("rejects a manifest declaring a traversal-shaped provides and creates no directory for it", async () => {
    // The declared provides reaches the line the fetch writes, so a traversal,
    // separator, or empty value is refused before any path is composed.
    const unsafe = sampleGeneratedValue(arbitraryUnsafeTreeSegment());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent(unsafe)), async (repository) => {
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });

      expect(outcome.ok, unsafe).toBe(false);
      await expect(readdir(join(repository.packageRoot, METHODOLOGY_TREE_ROOT))).rejects.toThrow();
    });
  });

  it("rejects a patch-versioned line and creates no directory for it", async () => {
    const version = sampleGeneratedValue(arbitraryMethodologyVersion());
    await withPluginsRepository(sampleGeneratedValue(arbitraryPluginsContent()), async (repository) => {
      const outcome = await runMethodologyFetch({
        repository: PLUGINS_REPOSITORY,
        repositoryUrl: repository.repositoryDir,
        revision: repository.revision,
        line: version.text,
        packageRoot: repository.packageRoot,
        dependencies: repository.dependencies,
      });
      expect(outcome.ok).toBe(false);
      await expect(readdir(join(repository.packageRoot, METHODOLOGY_TREE_ROOT))).rejects.toThrow();
    });
  });
});
