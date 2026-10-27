/**
 * Placement-and-release property over a real filesystem: for every generated interleaving of directory
 * requests and releases within one run, every directory lies inside the run root or the scratch parent
 * of its product, and none remains after its release.
 */

import { dirname, join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { TEMP_DIRECTORY_ENV_VAR, TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";
import {
  arbitraryTempDirectoryOperations,
  TEMP_DIRECTORY_OPERATION,
} from "@testing/generators/temp-directory/temp-directory";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";
import { withTempDirectoryHost } from "@testing/harnesses/temp-directory/temp-directory";

describe("any interleaving of directory requests and releases within one run", () => {
  it("keeps every directory inside the run root or scratch parent and leaves none after its release", async () => {
    await withTempDirectoryHost(async (host) => {
      await assertProperty(
        arbitraryTempDirectoryOperations(),
        async (operations) => {
          const run = host.openRun();

          const steps = await run.execute(operations);

          const runRoot = run.environment.get(TEMP_DIRECTORY_ENV_VAR.RUN_ROOT);
          for (const step of steps) {
            if (step.operation === TEMP_DIRECTORY_OPERATION.CREATE) {
              expect(step.path.startsWith(`${runRoot}${sep}`)).toBe(true);
              expect(step.existsAfter).toBe(true);
            } else if (step.operation === TEMP_DIRECTORY_OPERATION.CREATE_SCRATCH) {
              expect(dirname(step.path)).toBe(
                join(step.productDirectory ?? "", ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS),
              );
              expect(step.existsAfter).toBe(true);
            } else {
              expect(step.existsAfter).toBe(false);
            }
          }
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    });
  });
});
