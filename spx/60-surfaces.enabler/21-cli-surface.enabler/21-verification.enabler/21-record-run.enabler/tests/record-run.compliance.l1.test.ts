import { describe, expect, it } from "vitest";

import { VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { VERIFICATION_RUN_CLI_SURFACE, VERIFY_CLI } from "@/interfaces/cli/verify";
import { verifyNonNounLocalEvidenceCases } from "@testing/generators/verify/verify";
import {
  inspectVerificationEvidenceCommands,
  inspectVerificationRunCommandNames,
  inspectVerificationRunNounGroup,
  recordVerificationRunHandlerOptions,
} from "@testing/harnesses/verify/harness";
import { observeVerificationInvocation } from "@testing/harnesses/verify/rejected-invocation";

describe("record run compliance", () => {
  it("exposes the caller-driven verification-run lifecycle under the verification run noun group", () => {
    expect(inspectVerificationRunNounGroup()).toMatchObject({
      rootCommandPresent: true,
      childCommandNames: expect.arrayContaining([VERIFICATION_RUN_CLI_SURFACE.runCommandName]),
    });
  });

  // The lifecycle verb written directly below `spx verification`, outside the `run` noun group, is a
  // command the family does not declare; the diagnostic names the verb the caller wrote.
  it("rejects a caller-driven lifecycle verb outside the verification run noun group", async () => {
    const observation = await observeVerificationInvocation([
      VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
      VERIFY_CLI.startCommandName,
    ]);

    expect(observation.rejected).toBe(true);
    expect(observation.exitCode).toBeGreaterThan(0);
    expect(observation.stderr).toContain(VERIFY_CLI.startCommandName);
    expect(observation.handlerInvocationCount).toBe(0);
  });

  it("keeps scope and finding evidence additions noun-local", () => {
    expect(inspectVerificationEvidenceCommands()).toMatchObject({
      runCommandPresent: true,
      scopeCommandPresent: true,
      findingCommandPresent: true,
      scopeAddCommandPresent: true,
      findingAddCommandPresent: true,
      scopeRequiredFlags: expect.arrayContaining([VERIFY_CLI.payloadOption, VERIFY_CLI.idempotencyKeyOption]),
      findingRequiredFlags: expect.arrayContaining([VERIFY_CLI.payloadOption, VERIFY_CLI.idempotencyKeyOption]),
      scopePayloadDescription: VERIFY_CLI.payloadOptionDescription,
      findingPayloadDescription: VERIFY_CLI.payloadOptionDescription,
      scopeIdempotencyDescription: VERIFY_CLI.idempotencyKeyOptionDescription,
      findingIdempotencyDescription: VERIFY_CLI.idempotencyKeyOptionDescription,
    });
    VERIFICATION_RUN_CLI_SURFACE.forbiddenRunHelpTerms.forEach((forbiddenHelpTerm) => {
      expect(inspectVerificationEvidenceCommands().scopePayloadDescription).not.toContain(forbiddenHelpTerm);
      expect(inspectVerificationEvidenceCommands().findingPayloadDescription).not.toContain(forbiddenHelpTerm);
    });
    expect(inspectVerificationRunCommandNames().rootCommandNames).not.toContain(
      VERIFICATION_RUN_CLI_SURFACE.forbiddenRootCommandName,
    );
    VERIFICATION_RUN_CLI_SURFACE.forbiddenRunCommandNames.forEach((forbiddenCommandName) => {
      expect(inspectVerificationRunCommandNames().verificationCommandNames).not.toContain(forbiddenCommandName);
    });
  });

  // Each evidence command written directly below `spx verification run`, outside its noun-local
  // resource, is a command the run group does not declare; the diagnostic names the command the
  // caller wrote.
  it.each(verifyNonNounLocalEvidenceCases())(
    "rejects the non-noun-local evidence command $rejectedCommandName",
    async ({ rejectedCommandName }) => {
      const observation = await observeVerificationInvocation([
        VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
        VERIFICATION_RUN_CLI_SURFACE.runCommandName,
        rejectedCommandName,
      ]);

      expect(observation.rejected).toBe(true);
      expect(observation.exitCode).toBeGreaterThan(0);
      expect(observation.stderr).toContain(rejectedCommandName);
      expect(observation.handlerInvocationCount).toBe(0);
    },
  );

  it("passes parsed verification-run selector options to lifecycle handlers", async () => {
    await recordVerificationRunHandlerOptions().then((observation) => {
      expect(observation.recording.startOptions).toEqual([{
        verificationType: observation.scenario.verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: observation.scenario.scope,
        input: observation.inputSource,
      }]);
      expect(observation.recording.appendScopeOptions).toEqual([{
        verificationType: observation.scenario.verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: observation.scenario.scope,
        run: observation.runToken,
        payload: observation.scopePayloadSource,
        idempotencyKey: observation.idempotencyKeys.first,
      }]);
      expect(observation.recording.appendFindingOptions).toEqual([{
        verificationType: observation.scenario.verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: observation.scenario.scope,
        run: observation.runToken,
        payload: observation.findingPayloadSource,
        idempotencyKey: observation.idempotencyKeys.second,
      }]);
      expect(observation.recording.finishOptions).toEqual([{
        verificationType: observation.scenario.verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: observation.scenario.scope,
        run: observation.runToken,
        terminalStatus: observation.terminalStatus,
        terminalMetadata: observation.terminalMetadataSource,
      }]);
      expect(observation.recording.inputOptions).toEqual([{
        verificationType: observation.scenario.verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: observation.scenario.scope,
        run: observation.runToken,
      }]);
      expect(observation.recording.statusOptions).toEqual(observation.recording.inputOptions);
      expect(observation.recording.renderOptions).toEqual(observation.recording.inputOptions);
    });
  });
});
