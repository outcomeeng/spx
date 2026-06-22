import { createRecordingAtomicWriteFs } from "@testing/harnesses/atomic-file-write";
import { describe, expect, it } from "vitest";

import { atomicWriteTempPath, type RandomBytes, writeFileAtomic } from "@/lib/atomic-file-write";

const fixedBytes: RandomBytes = () => Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11]);

const targetPath = "/state/agent-run.json";
const payload = "event-log";

describe("writeFileAtomic atomicity contract", () => {
  it("replaces the target only by renaming a fully written temp sibling, never an in-place write", async () => {
    const fs = createRecordingAtomicWriteFs();
    await writeFileAtomic(targetPath, payload, { fs, randomBytes: fixedBytes });
    const tempPath = atomicWriteTempPath(targetPath, fixedBytes);

    // The target is never written directly, so a concurrent reader cannot observe a partial write.
    expect(fs.written).not.toContain(targetPath);
    // The temp sibling is written, then published onto the target by a single rename.
    expect(fs.written).toContain(tempPath);
    expect(fs.renamed).toEqual([{ from: tempPath, to: targetPath }]);
  });
});
