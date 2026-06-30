import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  ERROR_CODE_FILE_EXISTS,
  ERROR_CODE_NOT_FOUND,
  EXCLUSIVE_CREATE_FLAG,
  STATE_STORE_TEXT_ENCODING,
  WRITE_EXISTING_FLAG,
} from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

/** A set of distinct, filesystem-safe path segments drawn from the config-key generator. */
function distinctSegments(count: number): readonly string[] {
  const [drawn] = fc.sample(fc.uniqueArray(CONFIG_TEST_GENERATOR.key(), { minLength: count, maxLength: count }), {
    numRuns: 1,
  });
  if (drawn === undefined) throw new Error("segment generator returned no sample");
  return drawn;
}

async function expectErrorCode(operation: Promise<unknown>, code: string): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code });
}

describe("in-memory StateStoreFileSystem double — directory creation", () => {
  it("creates every ancestor on a recursive mkdir and rejects a non-recursive mkdir whose parent is absent", async () => {
    const fs = createInMemoryStateStoreFileSystem();
    const [a, b, c, sibling, orphanParent, orphanLeaf] = distinctSegments(6);

    await fs.mkdir(`/${a}/${b}/${c}`, { recursive: true });
    for (const directory of [`/${a}`, `/${a}/${b}`, `/${a}/${b}/${c}`]) {
      expect((await fs.lstat(directory)).isDirectory()).toBe(true);
    }

    await fs.mkdir(`/${a}/${sibling}`);
    expect((await fs.lstat(`/${a}/${sibling}`)).isDirectory()).toBe(true);

    await expectErrorCode(fs.mkdir(`/${orphanParent}/${orphanLeaf}`), ERROR_CODE_NOT_FOUND);
  });
});

describe("in-memory StateStoreFileSystem double — writes", () => {
  it("honors the exclusive-create and write-existing flags and appends onto existing content", async () => {
    const fs = createInMemoryStateStoreFileSystem();
    const [dir, file, absent, orphanParent, orphanLeaf] = distinctSegments(5);
    const initial = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const appended = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const replacement = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const filePath = `/${dir}/${file}`;
    await fs.mkdir(`/${dir}`, { recursive: true });

    await fs.writeFile(filePath, initial, { flag: EXCLUSIVE_CREATE_FLAG });
    await expectErrorCode(fs.writeFile(filePath, initial, { flag: EXCLUSIVE_CREATE_FLAG }), ERROR_CODE_FILE_EXISTS);
    await expectErrorCode(
      fs.writeFile(`/${dir}/${absent}`, initial, { flag: WRITE_EXISTING_FLAG }),
      ERROR_CODE_NOT_FOUND,
    );

    await fs.appendFile(filePath, appended);
    expect(await fs.readFile(filePath, STATE_STORE_TEXT_ENCODING)).toBe(`${initial}${appended}`);

    await fs.writeFile(filePath, replacement);
    expect(await fs.readFile(filePath, STATE_STORE_TEXT_ENCODING)).toBe(replacement);

    await expectErrorCode(fs.writeFile(`/${orphanParent}/${orphanLeaf}`, initial), ERROR_CODE_NOT_FOUND);
    await expectErrorCode(fs.appendFile(`/${orphanParent}/${orphanLeaf}`, initial), ERROR_CODE_NOT_FOUND);
    await expectErrorCode(fs.readFile(`/${dir}/${absent}`, STATE_STORE_TEXT_ENCODING), ERROR_CODE_NOT_FOUND);
  });
});

describe("in-memory StateStoreFileSystem double — removal and stat", () => {
  it("removes files and directories, forces past an absent path, and classifies a path via lstat", async () => {
    const fs = createInMemoryStateStoreFileSystem();
    const [dir, nestedDir, file, absent] = distinctSegments(4);
    const initial = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const filePath = `/${dir}/${file}`;
    await fs.mkdir(`/${dir}`, { recursive: true });
    await fs.mkdir(`/${dir}/${nestedDir}`, { recursive: true });
    await fs.writeFile(filePath, initial, { flag: EXCLUSIVE_CREATE_FLAG });

    const fileStat = await fs.lstat(filePath);
    expect([fileStat.isFile(), fileStat.isDirectory(), fileStat.isSymbolicLink()]).toEqual([true, false, false]);
    const directoryStat = await fs.lstat(`/${dir}`);
    expect([directoryStat.isFile(), directoryStat.isDirectory(), directoryStat.isSymbolicLink()]).toEqual([
      false,
      true,
      false,
    ]);
    await expectErrorCode(fs.lstat(`/${dir}/${absent}`), ERROR_CODE_NOT_FOUND);

    await fs.rm(filePath);
    await expectErrorCode(fs.lstat(filePath), ERROR_CODE_NOT_FOUND);
    await fs.writeFile(filePath, initial, { flag: EXCLUSIVE_CREATE_FLAG });
    const recreatedFileStat = await fs.lstat(filePath);
    expect(recreatedFileStat.birthtimeMs).toBeGreaterThan(fileStat.birthtimeMs);
    await fs.rm(filePath);
    await fs.rm(`/${dir}`);
    await expectErrorCode(fs.lstat(`/${dir}`), ERROR_CODE_NOT_FOUND);
    await expectErrorCode(fs.lstat(`/${dir}/${nestedDir}`), ERROR_CODE_NOT_FOUND);

    await expectErrorCode(fs.rm(`/${dir}/${absent}`), ERROR_CODE_NOT_FOUND);
    await fs.rm(`/${dir}/${absent}`, { force: true });
  });
});

describe("in-memory StateStoreFileSystem double — enumeration", () => {
  it("enumerates a directory's direct files and nested subdirectories exactly once", async () => {
    const fs = createInMemoryStateStoreFileSystem();
    const [root, emptyDir, childDir, directFile, grandchild] = distinctSegments(5);
    const initial = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    await fs.mkdir(`/${root}`, { recursive: true });
    await fs.mkdir(`/${root}/${emptyDir}`, { recursive: true });
    await fs.mkdir(`/${root}/${childDir}`, { recursive: true });
    await fs.writeFile(`/${root}/${directFile}`, initial, { flag: EXCLUSIVE_CREATE_FLAG });
    await fs.writeFile(`/${root}/${childDir}/${grandchild}`, initial, { flag: EXCLUSIVE_CREATE_FLAG });

    const byName = (left: string, right: string): number => left.localeCompare(right);
    const entries = await fs.readdir(`/${root}`, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(byName);
    const directories = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name).sort(byName);

    expect(files).toEqual([directFile]);
    expect(directories).toEqual([emptyDir, childDir].sort(byName));

    await expectErrorCode(
      fs.readdir(`/${root}/${emptyDir}/${grandchild}`, { withFileTypes: true }),
      ERROR_CODE_NOT_FOUND,
    );
  });
});
