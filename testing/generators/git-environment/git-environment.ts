/**
 * Generator for process environments mixing Git-namespaced variables, the Git ceiling variable, and
 * unrelated variables. The environment is built from three disjoint parts, so the environment a
 * read-only Git command should receive follows from construction and never from the code under test.
 *
 * @module generators/git-environment
 */

import * as fc from "fast-check";

import { GIT_TEST_ENVIRONMENT_KEYS } from "@testing/harnesses/git-test-constants";

const GIT_VARIABLE_PREFIX = "GIT_";
const VARIABLE_SUFFIX_PATTERN = /^[A-Z][A-Z0-9_]{0,10}$/;
const MAX_VARIABLES_PER_PART = 6;

export interface GitEnvironmentSample {
  /** The process environment handed to the code under test. */
  readonly environment: Record<string, string>;
  /** The variables of `environment` a read-only Git environment retains, by construction. */
  readonly retained: Record<string, string>;
}

function arbitraryVariableValue(): fc.Arbitrary<string> {
  return fc.string({ maxLength: 24 });
}

function arbitraryGitVariableName(): fc.Arbitrary<string> {
  return fc.stringMatching(VARIABLE_SUFFIX_PATTERN)
    .map((suffix) => `${GIT_VARIABLE_PREFIX}${suffix}`)
    .filter((name) => name !== GIT_TEST_ENVIRONMENT_KEYS.CEILING_DIRECTORIES);
}

function arbitraryUnrelatedVariableName(): fc.Arbitrary<string> {
  return fc.stringMatching(VARIABLE_SUFFIX_PATTERN)
    .filter((name) => !name.startsWith(GIT_VARIABLE_PREFIX));
}

export function arbitraryGitEnvironment(): fc.Arbitrary<GitEnvironmentSample> {
  return fc.record({
    gitVariables: fc.dictionary(arbitraryGitVariableName(), arbitraryVariableValue(), {
      maxKeys: MAX_VARIABLES_PER_PART,
    }),
    unrelatedVariables: fc.dictionary(arbitraryUnrelatedVariableName(), arbitraryVariableValue(), {
      maxKeys: MAX_VARIABLES_PER_PART,
    }),
    ceiling: fc.option(arbitraryVariableValue(), { nil: undefined }),
  }).map(({ gitVariables, unrelatedVariables, ceiling }) => {
    const ceilingEntry: Record<string, string> = ceiling === undefined
      ? {}
      : { [GIT_TEST_ENVIRONMENT_KEYS.CEILING_DIRECTORIES]: ceiling };
    return {
      environment: { ...unrelatedVariables, ...gitVariables, ...ceilingEntry },
      retained: { ...unrelatedVariables, ...ceilingEntry },
    };
  });
}
