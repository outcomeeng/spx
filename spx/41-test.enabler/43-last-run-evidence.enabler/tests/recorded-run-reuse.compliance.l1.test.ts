import { describe, expect, it } from "vitest";

import {
  findSatisfyingRecordedRun,
  RECORDED_RUN_UNSATISFIED_REASON,
  runTestsCommand,
  TEST_RESULT_KIND,
} from "@/commands/test";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import {
  commitTestFileChange,
  leaveUntrackedFile,
  recordPassedRun,
  snapshotRunDirectory,
  withRecordedRunRepository,
} from "@testing/harnesses/testing/recorded-run";

describe("taking a result from a recorded run", () => {
  it("adds, rewrites, and removes no run file whether or not the run satisfies the request", async () => {
    const { file } = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithOwnFile(typescriptTestingLanguage));
    const changedContent = sampleGeneratedValue(arbitraryDomainLiteral());

    await withRecordedRunRepository(file, async (repository) => {
      await recordPassedRun(repository);
      const recorded = await snapshotRunDirectory(repository.productDir);
      expect(recorded.size).toBe(1);
      const request = { productDir: repository.productDir, selectedPaths: [repository.testFile] };

      const satisfied = await findSatisfyingRecordedRun(request, repository.deps);
      expect(satisfied.satisfied).toBe(true);
      expect(await snapshotRunDirectory(repository.productDir)).toEqual(recorded);

      const invocationsAfterRecording = repository.runner.calls.length;
      const reused = await runTestsCommand({ productDir: repository.productDir, passing: false }, repository.deps);
      expect(reused.kind).toBe(TEST_RESULT_KIND.REUSED);
      expect(repository.runner.calls).toHaveLength(invocationsAfterRecording);
      expect(await snapshotRunDirectory(repository.productDir)).toEqual(recorded);

      await leaveUntrackedFile(repository);
      const dirty = await findSatisfyingRecordedRun(request, repository.deps);
      expect(dirty).toEqual({ satisfied: false, reason: RECORDED_RUN_UNSATISFIED_REASON.WORKTREE_DIRTY });
      expect(await snapshotRunDirectory(repository.productDir)).toEqual(recorded);

      await commitTestFileChange(repository, changedContent);
      const moved = await findSatisfyingRecordedRun(request, repository.deps);
      expect(moved).toEqual({ satisfied: false, reason: RECORDED_RUN_UNSATISFIED_REASON.HEAD_DIFFERS });
      expect(await snapshotRunDirectory(repository.productDir)).toEqual(recorded);
    });
  });
});
