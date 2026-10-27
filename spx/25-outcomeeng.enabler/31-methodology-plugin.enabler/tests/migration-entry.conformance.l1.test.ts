import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_CODING_AGENTS, MIGRATION_ENTRY_FILE_NAME } from "@/lib/methodology";
import { shippedMethodologyLines, shippedMigrationObservation } from "@testing/harnesses/methodology/shipped-tree";

describe("shipped migration entry conformance", () => {
  it("resolves each coding agent's recorded migration entry to the one file of its migration directory and the recorded instructions to files beside it", async () => {
    const lines = await shippedMethodologyLines();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const codingAgent of METHODOLOGY_CODING_AGENTS) {
        const observed = await shippedMigrationObservation(line, codingAgent);
        const subject = `${line} ${codingAgent}`;
        expect(observed.entries, subject).toHaveLength(1);
        expect(posix.basename(observed.entries[0]), subject).toBe(MIGRATION_ENTRY_FILE_NAME);
        expect(observed.instructions.length, subject).toBeGreaterThan(0);
        for (const path of [...observed.entries, ...observed.instructions]) {
          expect(posix.dirname(path), `${subject} ${path}`).toBe(observed.directory);
          expect(observed.recordedFileExists.get(path), `${subject} ${path}`).toBe(true);
        }
      }
    }
  });

  it("has each shipped entry name every recorded instruction by its file name", async () => {
    for (const line of await shippedMethodologyLines()) {
      for (const codingAgent of METHODOLOGY_CODING_AGENTS) {
        const observed = await shippedMigrationObservation(line, codingAgent);
        for (const entry of observed.entries) {
          for (const instruction of observed.instructions) {
            expect(observed.entryText.get(entry), `${line} ${codingAgent} ${instruction}`).toContain(
              posix.basename(instruction),
            );
          }
        }
      }
    }
  });
});
