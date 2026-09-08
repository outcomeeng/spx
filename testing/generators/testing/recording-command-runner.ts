import * as fc from "fast-check";

import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

/** One command a runner is asked to execute: the executable and its arguments. */
export interface CommandInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

export const RECORDING_COMMAND_RUNNER_GENERATOR = {
  invocations: arbitraryCommandInvocations,
} as const;

/** The ordered invocations a recording-runner property drives through one runner. */
function arbitraryCommandInvocations(): fc.Arbitrary<readonly CommandInvocation[]> {
  return fc.array(
    fc.record({ command: arbitraryDomainLiteral(), args: fc.array(arbitraryDomainLiteral()) }),
  );
}
