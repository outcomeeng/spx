import { posix } from "node:path";
import { describe, expect, it } from "vitest";

import { EXECUTE_RUN_CLI_ERROR, recorderTerminalStatusFor } from "@/commands/verification-exec";
import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { EXECUTE_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  inspectExecuteRunCommandTree,
  invokedInvocations,
  observeExecuteRunDescriptor,
  observeExecuteRunHandler,
  unresolvedRunnerInvocation,
} from "@testing/harnesses/verify/execute-run";

describe("execute run compliance", () => {
  it("exposes every executable verification type as a noun carrying the run verb", () => {
    const tree = inspectExecuteRunCommandTree();

    expect(tree.executableTypes).toContain(VERIFY_VERIFICATION_TYPE.TEST);
    for (const noun of tree.typeNouns) {
      expect(tree.verificationChildNames).toContain(noun.typeName);
      expect(noun.runVerbPresent).toBe(true);
    }
  });

  it("narrows the run through positional path operands and no path-scope flag", async () => {
    const tree = inspectExecuteRunCommandTree();
    for (const noun of tree.typeNouns) {
      expect(noun.variadicOperandName).toBeDefined();
      for (const forbiddenFlag of EXECUTE_RUN_CLI_SURFACE.forbiddenPathScopeFlags) {
        expect(noun.runVerbOptionFlags.join(" ")).not.toContain(forbiddenFlag);
      }
    }

    const fileOperand = await observeExecuteRunHandler((product) => [product.testPaths[0]], invokedInvocations()[0]);
    expect(fileOperand.diagnostic).toBeUndefined();
    expect(fileOperand.report?.testPaths).toEqual([fileOperand.product.testPaths[0]]);
    expect(fileOperand.drivenRequest?.testPaths).toEqual([fileOperand.product.testPaths[0]]);
    expect(fileOperand.report?.locator.scopeType).toBe(VERIFY_SCOPE_TYPE.FILE);
    expect(fileOperand.report?.locator.scopeIdentity).toBe(posix.dirname(fileOperand.product.testPaths[0]));

    const nodeOperand = await observeExecuteRunHandler((product) => [product.nodePaths[1]], invokedInvocations()[0]);
    expect(nodeOperand.diagnostic).toBeUndefined();
    expect(nodeOperand.report?.testPaths).toEqual([nodeOperand.product.testPaths[1]]);
    expect(nodeOperand.report?.locator.scopeIdentity).toBe(nodeOperand.product.nodePaths[1]);

    const noOperand = await observeExecuteRunHandler(() => [], invokedInvocations()[0]);
    expect(noOperand.diagnostic).toBeUndefined();
    expect(noOperand.report?.testPaths).toEqual([...noOperand.product.testPaths].sort(compareAsciiStrings));
    expect(noOperand.report?.locator.scopeIdentity).toBe(SPEC_TREE_CONFIG.ROOT_DIRECTORY);

    const descriptor = await observeExecuteRunDescriptor(fileOperand.product.testPaths, {
      exitCode: VERIFY_CLI_EXIT_CODE.OK,
    });
    expect(descriptor.handlerOptions).toEqual([
      { verificationType: VERIFY_VERIFICATION_TYPE.TEST, operands: fileOperand.product.testPaths },
    ]);
  });

  it("exposes no verification type as a verb command path", () => {
    const tree = inspectExecuteRunCommandTree();
    for (const forbiddenVerb of EXECUTE_RUN_CLI_SURFACE.forbiddenTypeVerbNames) {
      expect(tree.verificationChildNames).not.toContain(forbiddenVerb);
    }
  });

  it("reports one structured result with the run locator and terminal status, exiting zero exactly when passed", async () => {
    for (const invocation of invokedInvocations()) {
      const observation = await observeExecuteRunHandler((product) => [product.nodePaths[0]], invocation);
      if (!invocation.invoked) continue;

      expect(observation.report?.runToken).toBe(observation.report?.locator.runToken);
      expect(observation.report?.locator.verificationType).toBe(VERIFY_VERIFICATION_TYPE.TEST);
      expect(observation.report?.terminalStatus).toBe(recorderTerminalStatusFor(invocation.terminalStatus));
      expect(observation.report?.unresolvedRunner).toBeUndefined();
      expect(observation.exitCode).toBe(
        recorderTerminalStatusFor(invocation.terminalStatus) === JOURNAL_RUN_STATE_STATUS.PASSED
          ? VERIFY_CLI_EXIT_CODE.OK
          : VERIFY_CLI_EXIT_CODE.ERROR,
      );
      expect(JSON.parse(observation.recordedInput?.content ?? "")).toMatchObject({
        verificationType: VERIFY_VERIFICATION_TYPE.TEST,
        operands: observation.operands,
        testPaths: observation.report?.testPaths,
      });
    }

    const passed = await observeExecuteRunHandler(() => [], invokedInvocations()[0]);
    const descriptor = await observeExecuteRunDescriptor([], { exitCode: passed.exitCode, report: passed.report });
    expect(descriptor.stdout.trim()).toBe(JSON.stringify(passed.report));
    expect(descriptor.stderr).toHaveLength(0);
    expect(descriptor.exitCode).toBe(passed.exitCode);
  });

  it("reports an operand selecting no test file without opening a run, and names a runnerless product directory after sealing", async () => {
    const unresolvedOperand = sampleGeneratedValue(arbitrarySourceFilePath());
    const noMatch = await observeExecuteRunHandler(() => [unresolvedOperand], invokedInvocations()[0]);
    expect(noMatch.report).toBeUndefined();
    expect(noMatch.drivenRequest).toBeUndefined();
    expect(noMatch.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(noMatch.diagnostic).toContain(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_OPERANDS);
    expect(noMatch.diagnostic).toContain(unresolvedOperand);

    const unresolvedRunner = unresolvedRunnerInvocation();
    const runnerless = await observeExecuteRunHandler(() => [], unresolvedRunner.invocation);
    expect(runnerless.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(runnerless.report?.unresolvedRunner).toEqual({ productDir: unresolvedRunner.productDir });
    expect(runnerless.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(runnerless.diagnostic).toContain(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_RUNNER);
    expect(runnerless.diagnostic).toContain(unresolvedRunner.productDir);

    const descriptor = await observeExecuteRunDescriptor([], {
      exitCode: noMatch.exitCode,
      diagnostic: noMatch.diagnostic,
    });
    expect(descriptor.stdout).toHaveLength(0);
    expect(descriptor.stderr.trim()).toBe(noMatch.diagnostic);
    expect(descriptor.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  });
});
