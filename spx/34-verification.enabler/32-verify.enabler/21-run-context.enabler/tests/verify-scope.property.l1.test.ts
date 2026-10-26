import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import { parseChangesetScope, VERIFY_SCOPE_ERROR } from "@/domains/verify/verify";
import { arbitraryFileScopeIdentityScenario, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

import {
  createVerifyRunContextScenario,
  runChangedPathsContextScenario,
  runChangesetReconstructionScenario,
  runChangesetScopeScenario,
  startChangesetScopeRun,
  startFileScopeRun,
  startWithScopeType,
  withScope,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify scope properties", () => {
  it("resolves any changeset into the derived changed-file scope", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.changesetScopeScenario(),
      async (scenario) => {
        expect((await runChangesetScopeScenario(scenario)).resolvedScope).toEqual(scenario.resolvedPaths);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects overlapping changeset separators", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.overlappingChangesetScope(),
      (scope) => {
        expect(parseChangesetScope(scope)).toStrictEqual({
          ok: false,
          error: VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps base and head into distinct context digests", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.distinctChangesetRanges(),
      async (scenario) => {
        const started = await runChangesetReconstructionScenario(scenario);
        expect(started.first.context.context.subject).toEqual({
          kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
          base: scenario.first.base,
          head: scenario.first.head,
        });
        expect(started.second.context.context.subject).toEqual({
          kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
          base: scenario.second.base,
          head: scenario.second.head,
        });
        expect(started.first.context.digest).toBe(started.first.report.contextDigest);
        expect(started.second.context.digest).toBe(started.second.report.contextDigest);
        expect(started.second.report.contextDigest).not.toBe(started.first.report.contextDigest);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("keeps derived changed paths outside the canonical context", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.changesetChangedPathsPair(),
      async (scenario) => {
        const started = await runChangedPathsContextScenario(scenario);
        expect(started.second.contextDigest).toBe(started.first.contextDigest);
        expect(started.second.resolvedScope).not.toEqual(started.first.resolvedScope);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps resolved selectors and run target to the reported run token", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.runLocatorScenario(),
      async (scope) => {
        const started = await startChangesetScopeRun(
          withVerificationType(
            withScope(createVerifyRunContextScenario(), scope.range.base, scope.range.head),
            scope.verificationType,
          ),
        );
        expect(started.report.locator).toStrictEqual(started.expectedLocator);
        expect(started.runTargetExists).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("preserves every file selector in its run locator", async () => {
    await assertProperty(
      arbitraryFileScopeIdentityScenario(),
      async (scope) => {
        const started = await startFileScopeRun(scope.input);
        expect(started.report.locator).toStrictEqual(started.expectedLocator);
        expect(started.runTargetExists).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects every scope type outside the supported scope types", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.unsupportedScopeType(),
      async (scopeType) => {
        const started = await startWithScopeType(scopeType);
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
