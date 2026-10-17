import { describe, expect, it } from "vitest";

import {
  expectedRecordedPaths,
  READ_PATH_KIND,
  READ_RECORDER_GENERATOR,
  READ_STEP,
} from "@testing/generators/testing/read-recorder";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { observeReadPlan, READ_OUTCOME_KIND } from "@testing/harnesses/testing/read-recorder";

describe("read recorder collected paths", () => {
  // Assertion design record
  // - Assertion: for every sequence of file reads a module performs (repeated reads, reads after a working-directory
  //   change, reads through a symbolic link, reads of a path that resolves to no file), the metadata holds the sorted
  //   unique absolute paths read, each resolved against the working directory at its read with symbolic links
  //   resolved, drops an observed path that does not resolve while that read fails unchanged, and holds no entry when
  //   nothing was read. Quantifier: universal over an open domain of read sequences; evidence type property.
  // - Production subject: the read recorder installed over the real node:fs module, crossed at the module's
  //   read entry points; the observations are the collected paths and how each read ended with and without the recorder.
  // - Case provenance: READ_RECORDER_GENERATOR.readPlan, which varies the path kind (regular file, symbolic link,
  //   unresolved path) because that boundary is product-owned variable behavior, together with the entry point,
  //   the working-directory changes, and repeats.
  // - Oracle owner: expectedRecordedPaths, a construction law from the assertion's own sentence (a link opens the file
  //   it points at, an unresolved path opens nothing, names resolve against the directory the preceding changes set),
  //   independent of the recorder's realpath and resolve calls; the unchanged-failure expectation compares each read
  //   with the same read made through the original function before installation.
  // - Rejected mutation: the recorder records the resolved path without following symbolic links, or records the
  //   observed path when it does not resolve to a file.
  // - Failure observation: recordedPaths then holds a link path or an unresolved path the oracle excludes, so the
  //   toEqual(expectedRecordedPaths(...)) expectation below fails.
  it(
    "holds the sorted unique absolute paths read, each resolved against the working directory at its read with symbolic links resolved, drops a path that resolves to no file while its read fails unchanged, and holds no entry when nothing was read",
    async () => {
      await assertProperty(READ_RECORDER_GENERATOR.readPlan(), async (plan) => {
        const { root, recordedPaths, originalOutcomes, wrappedOutcomes } = await observeReadPlan(plan);

        expect(recordedPaths).toEqual(expectedRecordedPaths(root, plan));
        expect(wrappedOutcomes).toEqual(originalOutcomes);
        const readSteps = plan.steps.filter((step) => step.kind === READ_STEP.READ);
        for (const [index, step] of readSteps.entries()) {
          if (step.kind === READ_STEP.READ && step.pathKind === READ_PATH_KIND.UNRESOLVED) {
            expect(wrappedOutcomes[index].kind).toBe(READ_OUTCOME_KIND.FAILED);
          }
        }
      }, PROPERTY_CLASSIFICATION.SMALL_L1);
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
