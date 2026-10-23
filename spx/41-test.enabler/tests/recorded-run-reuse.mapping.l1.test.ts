import { describe, expect, it } from "vitest";

import { runTestsCommand, TEST_RESULT_KIND } from "@/commands/test";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import {
  arrangeUnsatisfiedRequest,
  snapshotRunDirectory,
  UNSATISFIED_REQUEST_CASE,
  withRecordedRunRepository,
} from "@testing/harnesses/testing/recorded-run";

describe("a request no recorded run satisfies", () => {
  it.each(Object.values(UNSATISFIED_REQUEST_CASE))(
    "dispatches its selection and records a new run when the recorded runs are in the state %s",
    async (unsatisfiedCase) => {
      const { ownFile, descendantFile } = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.nestedFiles(typescriptTestingLanguage),
      );
      const changedContent = sampleGeneratedValue(arbitraryDomainLiteral());

      await withRecordedRunRepository(ownFile, async (repository) => {
        const deps = await arrangeUnsatisfiedRequest(
          repository,
          unsatisfiedCase,
          changedContent,
          descendantFile,
        );
        const invocationsBeforeRequest = repository.runner.calls.length;
        const runFilesBeforeRequest = await snapshotRunDirectory(repository.productDir);

        const result = await runTestsCommand({ productDir: repository.productDir, passing: false }, deps);

        expect(result.kind).toBe(TEST_RESULT_KIND.EXECUTED);
        expect(repository.runner.calls.length).toBeGreaterThan(invocationsBeforeRequest);
        expect((await snapshotRunDirectory(repository.productDir)).size).toBe(runFilesBeforeRequest.size + 1);
      });
    },
  );
});
