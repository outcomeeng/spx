import { execa } from "execa";
import fc from "fast-check";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SESSION_STATUSES } from "@/domains/session/types";
import { createSessionHarness } from "@testing/harnesses/session/harness";

const [TODO] = SESSION_STATUSES;
const CLI_ENTRY = join(process.cwd(), "bin/spx.js");

async function runSpx(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa("node", [CLI_ENTRY, ...args], { cwd: process.cwd(), reject: false });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

function sessionId(index: number): string {
  return `2026-01-${String(index + 1).padStart(2, "0")}_10-00-00`;
}

describe("session CLI batch properties", () => {
  it("GIVEN generated valid and invalid IDs WHEN delete runs THEN success and error counts match inputs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        async (validCount, invalidCount) => {
          const harness = await createSessionHarness();
          try {
            const validIds = Array.from({ length: validCount }, (_, index) => sessionId(index));
            const invalidIds = Array.from({ length: invalidCount }, (_, index) => `missing-${index}`);
            for (const id of validIds) {
              await harness.writeSession(TODO, id);
            }

            const result = await runSpx(
              "session",
              "delete",
              ...validIds,
              ...invalidIds,
              "--sessions-dir",
              harness.sessionsDir,
            );

            const combined = `${result.stdout}\n${result.stderr}`;
            const successCount = validIds.filter((id) => combined.includes(id)).length;
            const errorCount = invalidIds.filter((id) => combined.includes(id)).length;
            expect(successCount).toBe(validCount);
            expect(errorCount).toBe(invalidCount);
            expect(result.exitCode).toBe(invalidCount === 0 ? 0 : 1);
          } finally {
            await harness.cleanup();
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("GIVEN ordered IDs WHEN delete runs THEN output preserves argument order", async () => {
    const harness = await createSessionHarness();
    try {
      const ids = [sessionId(0), "missing-0", sessionId(1), "missing-1"];
      await harness.writeSession(TODO, ids[0]);
      await harness.writeSession(TODO, ids[2]);

      const result = await runSpx("session", "delete", ...ids, "--sessions-dir", harness.sessionsDir);
      const combined = `${result.stdout}\n${result.stderr}`;
      let previousIndex = -1;
      for (const id of ids) {
        const index = combined.indexOf(id);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    } finally {
      await harness.cleanup();
    }
  });
});
