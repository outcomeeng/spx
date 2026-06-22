import { createRecordingAtomicWriteFs, type RecordingAtomicWriteFs } from "@testing/harnesses/atomic-file-write";
import { describe, expect, it } from "vitest";

import { atomicWriteTempPath, type RandomBytes, writeFileAtomic } from "@/lib/atomic-file-write";

const tempTokenBytes = Uint8Array.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
const fixedBytes: RandomBytes = () => Buffer.from(tempTokenBytes);

const targetPath = "/data/settings.json";
const newContent = "{\"k\":1}\n";

describe("writeFileAtomic success", () => {
  it("leaves the target holding the new content and no temp sibling behind", async () => {
    const fs = createRecordingAtomicWriteFs();
    await writeFileAtomic(targetPath, newContent, { fs, randomBytes: fixedBytes });

    expect(fs.files.get(targetPath)).toBe(newContent);
    expect(fs.files.has(atomicWriteTempPath(targetPath, fixedBytes))).toBe(false);
  });
});

describe("writeFileAtomic failure", () => {
  it("removes the temp sibling and propagates the error when the rename throws", async () => {
    const boom = new Error("rename failed");
    const fs: RecordingAtomicWriteFs = { ...createRecordingAtomicWriteFs(), rename: () => Promise.reject(boom) };
    const tempPath = atomicWriteTempPath(targetPath, fixedBytes);

    await expect(writeFileAtomic(targetPath, newContent, { fs, randomBytes: fixedBytes })).rejects.toBe(boom);

    expect(fs.removed).toContain(tempPath);
    expect(fs.files.has(tempPath)).toBe(false);
    expect(fs.files.has(targetPath)).toBe(false);
  });

  it("removes the temp sibling and propagates the error when the write throws", async () => {
    const boom = new Error("write failed");
    const base = createRecordingAtomicWriteFs();
    const fs: RecordingAtomicWriteFs = {
      ...base,
      writeFile: (path, data) => {
        base.files.set(path, data);
        return Promise.reject(boom);
      },
    };
    const tempPath = atomicWriteTempPath(targetPath, fixedBytes);

    await expect(writeFileAtomic(targetPath, newContent, { fs, randomBytes: fixedBytes })).rejects.toBe(boom);

    expect(fs.removed).toContain(tempPath);
    expect(fs.files.has(tempPath)).toBe(false);
    expect(fs.files.has(targetPath)).toBe(false);
  });
});
