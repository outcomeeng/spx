import type { TestCommandDependencies } from "@/commands/test";
import type { GitDependencies } from "@/lib/git/root";
import type { TestRunnerDependencies } from "@/test/languages/types";
import { testingRegistry } from "@/test/registry";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

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
      stdout: sampleLiteralTestValue(arbitraryDomainLiteral()),
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
