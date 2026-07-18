import { dirname } from "node:path";

import { describe, it } from "vitest";

import { atomicWriteTempPath } from "@/lib/atomic-file-write";
import { ATOMIC_FILE_WRITE_TEST_GENERATOR } from "@testing/generators/atomic-file-write";
import { fixedAtomicWriteRandomBytes } from "@testing/harnesses/atomic-file-write";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("atomicWriteTempPath sibling invariant", () => {
  it("places the temp path in the target's own directory so the rename is intra-filesystem", () => {
    assertProperty(
      ATOMIC_FILE_WRITE_TEST_GENERATOR.writeInput(),
      ({ targetPath, temporaryBytes }) =>
        dirname(atomicWriteTempPath(targetPath, fixedAtomicWriteRandomBytes(temporaryBytes))) === dirname(targetPath),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("atomicWriteTempPath uniqueness suffix", () => {
  it("derives the suffix from the injected random bytes, identically across repeated calls", () => {
    assertProperty(
      ATOMIC_FILE_WRITE_TEST_GENERATOR.writeInput(),
      ({ targetPath, temporaryBytes }) => {
        const source = fixedAtomicWriteRandomBytes(temporaryBytes);
        const temporaryPath = atomicWriteTempPath(targetPath, source);
        return atomicWriteTempPath(targetPath, source) === temporaryPath
          && temporaryPath.includes(Buffer.from(temporaryBytes).toString("hex"));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("yields distinct temp paths for distinct random bytes", () => {
    assertProperty(
      ATOMIC_FILE_WRITE_TEST_GENERATOR.distinctTemporaryInput(),
      ({ targetPath, temporaryBytes: [first, second] }) =>
        atomicWriteTempPath(targetPath, fixedAtomicWriteRandomBytes(first))
          !== atomicWriteTempPath(targetPath, fixedAtomicWriteRandomBytes(second)),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
