import { execa } from "execa";
import fc from "fast-check";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SESSION_STATUSES } from "@/domains/session/types";
import { sampleDistinctSessionIds } from "@testing/generators/session/session";
import { createSessionHarness } from "@testing/harnesses/session/harness";

const [TODO] = SESSION_STATUSES;
const cliEntry = join(process.cwd(), "bin/spx.js");
const sessionCliPropertyTimeoutMs = 90_000;

async function runSpx(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa("node", [cliEntry, ...args], { cwd: process.cwd(), reject: false });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

/** A synthetic id that resolves to no session, exercising the per-ID failure path. */
function missingSessionId(index: number): string {
  return `missing-${index}`;
}

function expectIdsInOrder(output: string, ids: readonly string[]): void {
  let previousIndex = -1;
  for (const id of ids) {
    const index = output.indexOf(id);
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

describe("session CLI batch properties", () => {
  it(
    "GIVEN generated valid and invalid IDs WHEN delete runs THEN success and error counts match inputs",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 0, max: 5 }),
          async (validCount, invalidCount) => {
            const harness = await createSessionHarness();
            try {
              const validIds = [...sampleDistinctSessionIds(validCount)];
              const invalidIds = Array.from({ length: invalidCount }, (_, index) => missingSessionId(index));
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
    },
    sessionCliPropertyTimeoutMs,
  );

  it(
    "GIVEN generated valid and invalid IDs WHEN pickup runs THEN success and error counts match inputs",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }))
            .filter(([validCount, invalidCount]) => validCount + invalidCount > 0),
          async ([validCount, invalidCount]) => {
            const harness = await createSessionHarness();
            try {
              const validIds = [...sampleDistinctSessionIds(validCount)];
              const invalidIds = Array.from({ length: invalidCount }, (_, index) => missingSessionId(index));
              const ids = [...validIds, ...invalidIds];
              for (const id of validIds) {
                await harness.writeSession(TODO, id);
              }

              const result = await runSpx(
                "session",
                "pickup",
                ...ids,
                "--sessions-dir",
                harness.sessionsDir,
              );

              const combined = `${result.stdout}\n${result.stderr}`;
              const successCount = validIds.filter((id) => combined.includes(id)).length;
              const errorCount = invalidIds.filter((id) => combined.includes(id)).length;
              expect(successCount).toBe(validCount);
              expect(errorCount).toBe(invalidCount);
              expect(result.exitCode).toBe(invalidCount === 0 ? 0 : 1);
              expectIdsInOrder(combined, ids);
            } finally {
              await harness.cleanup();
            }
          },
        ),
        { numRuns: 10 },
      );
    },
    sessionCliPropertyTimeoutMs,
  );

  it("GIVEN ordered IDs WHEN delete runs THEN output preserves argument order", async () => {
    const harness = await createSessionHarness();
    try {
      const [valid0, valid1] = sampleDistinctSessionIds(2);
      const ids = [valid0, missingSessionId(0), valid1, missingSessionId(1)];
      await harness.writeSession(TODO, ids[0]);
      await harness.writeSession(TODO, ids[2]);

      const result = await runSpx("session", "delete", ...ids, "--sessions-dir", harness.sessionsDir);
      const combined = `${result.stdout}\n${result.stderr}`;
      expectIdsInOrder(combined, ids);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN ordered IDs WHEN pickup runs THEN output preserves argument order", async () => {
    const harness = await createSessionHarness();
    try {
      const [valid0, valid1] = sampleDistinctSessionIds(2);
      const ids = [valid0, missingSessionId(0), valid1, missingSessionId(1)];
      await harness.writeSession(TODO, ids[0]);
      await harness.writeSession(TODO, ids[2]);

      const result = await runSpx("session", "pickup", ...ids, "--sessions-dir", harness.sessionsDir);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(result.exitCode).toBe(1);
      expectIdsInOrder(combined, ids);
    } finally {
      await harness.cleanup();
    }
  });
});
