import { describe } from "vitest";

import rule, { NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME } from "@eslint-rules/no-async-spawn-outside-lifecycle";
import { noAsyncSpawnOutsideLifecycleCases } from "@testing/generators/validation/ast-enforcement";
import { runValidationRuleTester } from "@testing/harnesses/validation/eslint";

describe("async child process lifecycle import rule", () => {
  runValidationRuleTester({
    ruleName: NO_ASYNC_SPAWN_OUTSIDE_LIFECYCLE_RULE_NAME,
    rule,
    cases: noAsyncSpawnOutsideLifecycleCases(),
  });
});
