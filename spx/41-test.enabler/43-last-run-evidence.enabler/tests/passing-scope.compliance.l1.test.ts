import { rm } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { runTestsCommand } from "@/commands/test";
import type { GitDependencies } from "@/lib/git/root";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { TESTING_CONFIG_FIELDS, testingConfigDescriptor } from "@/test/config";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { readTestingRuns, testingRunsDir } from "@/test/run-state";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { sampleTestRunStateValue, TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import {
  withTestingTempProductDir,
  writeTestFileFixture,
  writeTestingConfig,
  writeTestingStateFile,
} from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

function invokedArgs(
  runner: { readonly calls: ReadonlyArray<{ readonly args: readonly string[] }> },
): readonly string[] {
  return runner.calls.flatMap((call) => call.args);
}

function gitIdentityStub(): GitDependencies {
  return {
    execa: async () => ({ exitCode: 0, stdout: sampleLiteralTestValue(arbitraryDomainLiteral()), stderr: "" }),
  };
}

function testCommandDeps(
  runner: ReturnType<typeof createRecordingCommandRunner>,
): {
  readonly registry: typeof testingRegistry;
  readonly runnerDepsFor: () => typeof runner;
  readonly git: GitDependencies;
} {
  return { registry: testingRegistry, runnerDepsFor: () => runner, git: gitIdentityStub() };
}

function resolvePassingScope(sectionValue: unknown): unknown {
  const result = testingConfigDescriptor.validate(sectionValue);
  if (!result.ok) throw new Error(result.error);
  return result.value.passingScope;
}

describe("passing scope is policy from config, never inferred from last-run state", () => {
  it("ALWAYS: stale or deleted state never changes the config-derived passing scope applied by `spx test passing`", async () => {
    const [excludedNode, includedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const excludedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
    );
    const includedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNode),
    );
    const excludedScope = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNode}`;
    const sectionValue = {
      [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: { exclude: [excludedScope] },
    };
    const passingScopeBefore = resolvePassingScope(sectionValue);

    const runFileName = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const state = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());

    await withTestingTempProductDir(async (productDir) => {
      await writeTestingStateFile(productDir, runFileName, JSON.stringify(state));
      await writeTestFileFixture(productDir, excludedFile);
      await writeTestFileFixture(productDir, includedFile);
      await writeTestingConfig(productDir, { exclude: [excludedScope] });

      const withState = await readTestingRuns(productDir);
      expect(withState.ok).toBe(true);
      if (!withState.ok) throw new Error(withState.error);
      expect(withState.value.terminalRuns.length).toBe(1);
      expect(resolvePassingScope(sectionValue)).toEqual(passingScopeBefore);

      const withStateRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand({ productDir, passing: true }, testCommandDeps(withStateRunner));
      expect(invokedArgs(withStateRunner)).not.toContain(excludedFile);
      expect(invokedArgs(withStateRunner)).toContain(includedFile);

      await rm(testingRunsDir(productDir), { recursive: true, force: true });

      const afterDelete = await readTestingRuns(productDir);
      expect(afterDelete.ok).toBe(true);
      if (!afterDelete.ok) throw new Error(afterDelete.error);
      expect(afterDelete.value.terminalRuns.length).toBe(0);
      expect(resolvePassingScope(sectionValue)).toEqual(passingScopeBefore);

      const afterDeleteRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand({ productDir, passing: true }, testCommandDeps(afterDeleteRunner));
      expect(invokedArgs(afterDeleteRunner)).not.toContain(excludedFile);
      expect(invokedArgs(afterDeleteRunner)).toContain(includedFile);
    });
  });
});
