import type { TestCommandDependencies } from "@/commands/test";
import type { GitDependencies } from "@/lib/git/root";
import type { TestRunnerDependencies } from "@/test/languages/types";
import { testingRegistry } from "@/test/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";

// Drawn once under the generator sampler's pinned seed at load, so no sampler runs while a
// property predicate executes; the stub's stdout never decides a verdict.
const GIT_IDENTITY_STDOUT = sampleGeneratedValue(arbitraryDomainLiteral());

export interface RecordedCommandCall {
  readonly args: readonly string[];
}

export function invokedArgs(
  runner: { readonly calls: readonly RecordedCommandCall[] },
): readonly string[] {
  return runner.calls.flatMap((call) => call.args);
}

function gitIdentityStub(): GitDependencies {
  return {
    execa: async () => ({
      exitCode: 0,
      stdout: GIT_IDENTITY_STDOUT,
      stderr: "",
    }),
  };
}

export function testingCommandDependencies(
  runner: TestRunnerDependencies,
): TestCommandDependencies {
  return {
    registry: testingRegistry,
    runnerDepsFor: () => runner,
    git: gitIdentityStub(),
  };
}
