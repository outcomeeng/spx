import { describe, it } from "vitest";

import { publishJsonlRecordAtomically, STATE_STORE_ERROR, STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("record store — atomic JSONL publication property", () => {
  it("commits exactly one complete record for every generated collision", async () => {
    await assertProperty(
      STATE_STORE_TEST_GENERATOR.atomicPublicationCollision(),
      async ({ destination, records: [firstRecord, secondRecord], temporaryBytes }): Promise<boolean> => {
        const fs = createInMemoryStateStoreFileSystem();
        const [first, second] = await Promise.all([
          publishJsonlRecordAtomically(destination, firstRecord, {
            fs,
            randomBytes: (size) => Buffer.alloc(size, temporaryBytes[0]),
          }),
          publishJsonlRecordAtomically(destination, secondRecord, {
            fs,
            randomBytes: (size) => Buffer.alloc(size, temporaryBytes[1]),
          }),
        ]);
        const results = [first, second] as const;
        const winnerCount = results.filter((result) => result.ok).length;
        const collisionCount = results.filter(
          (result) => !result.ok && result.error === STATE_STORE_ERROR.RECORD_ALREADY_EXISTS,
        ).length;
        const winner = first.ok
          ? { record: firstRecord, result: first }
          : second.ok
          ? { record: secondRecord, result: second }
          : undefined;
        if (winner === undefined) return false;
        const destinationContent = await fs.readFile(destination, STATE_STORE_TEXT_ENCODING);
        return winnerCount === 1
          && collisionCount === 1
          && winner.result.value === destination
          && destinationContent === `${JSON.stringify(winner.record)}\n`;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
