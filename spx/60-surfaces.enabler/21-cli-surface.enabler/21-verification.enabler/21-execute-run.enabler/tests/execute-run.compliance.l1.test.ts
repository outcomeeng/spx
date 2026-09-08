import { posix } from "node:path";
import { describe, expect, it } from "vitest";

import { EXECUTE_RUN_CLI_ERROR, EXECUTE_RUN_CLI_WARNING } from "@/commands/verification-exec";
import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { PATH_OPERAND_CLI_SURFACE } from "@/interfaces/cli/lib/path-operands";
import { CLI_STREAM_REPORT } from "@/interfaces/cli/lib/stream-report";
import { EXECUTE_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { DEL_CHAR_CODE, FIRST_PRINTABLE_CHAR_CODE } from "@/lib/sanitize-cli-argument";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryTerminalUnsafeText } from "@testing/generators/terminal-text/terminal-text";
import {
  handlerFailingWith,
  handlerReturning,
  inspectExecuteRunCommandTree,
  invokedInvocations,
  invokeFromFirstTestDir,
  observeExecuteRunDescriptor,
  observeExecuteRunHandler,
  observeExecuteRunWithAgenticType,
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
      for (const forbiddenFlag of PATH_OPERAND_CLI_SURFACE.forbiddenScopeFlags) {
        expect(noun.runVerbOptionFlags.join(" ")).not.toContain(forbiddenFlag);
      }
    }

    const fileOperand = await observeExecuteRunHandler({ selectOperands: (product) => [product.testPaths[0]] });
    expect(fileOperand.diagnostic).toBeUndefined();
    expect(fileOperand.report?.testPaths).toEqual([fileOperand.product.testPaths[0]]);
    expect(fileOperand.drivenRequest?.testPaths).toEqual([fileOperand.product.testPaths[0]]);
    expect(fileOperand.report?.locator.scopeType).toBe(VERIFY_SCOPE_TYPE.FILE);
    expect(fileOperand.report?.locator.scopeIdentity).toBe(posix.dirname(fileOperand.product.testPaths[0]));

    const nodeOperand = await observeExecuteRunHandler({ selectOperands: (product) => [product.nodePaths[1]] });
    expect(nodeOperand.diagnostic).toBeUndefined();
    expect(nodeOperand.report?.testPaths).toEqual([nodeOperand.product.testPaths[1]]);
    expect(nodeOperand.report?.locator.scopeIdentity).toBe(nodeOperand.product.nodePaths[1]);

    const noOperand = await observeExecuteRunHandler();
    expect(noOperand.diagnostic).toBeUndefined();
    expect(noOperand.report?.testPaths).toEqual([...noOperand.product.testPaths].sort(compareAsciiStrings));
    expect(noOperand.report?.locator.scopeIdentity).toBe(SPEC_TREE_CONFIG.ROOT_DIRECTORY);

    const descriptor = await observeExecuteRunDescriptor(
      fileOperand.product.testPaths,
      handlerReturning({ exitCode: VERIFY_CLI_EXIT_CODE.OK }),
    );
    expect(descriptor.handlerOptions).toEqual([
      { verificationType: VERIFY_VERIFICATION_TYPE.TEST, operands: fileOperand.product.testPaths },
    ]);
  });

  it("roots the run at the worktree product root from any directory inside the product, and at the invocation directory with a warning outside a repository", async () => {
    const fromRoot = await observeExecuteRunHandler();
    expect(fromRoot.drivenRequest?.productDir).toBe(fromRoot.product.productDir);
    expect(fromRoot.warning).toBeUndefined();

    const fromInside = await observeExecuteRunHandler({ selectInvocationDir: invokeFromFirstTestDir });
    expect(fromInside.invocationDir).not.toBe(fromInside.product.productDir);
    expect(fromInside.drivenRequest?.productDir).toBe(fromInside.product.productDir);
    expect(fromInside.recorderProbeCwds.length).toBeGreaterThan(0);
    expect(new Set(fromInside.recorderProbeCwds)).toEqual(new Set([fromInside.product.productDir]));
    expect(fromInside.report?.testPaths).toEqual([...fromInside.product.testPaths].sort(compareAsciiStrings));
    expect(fromInside.report?.locator.scopeIdentity).toBe(SPEC_TREE_CONFIG.ROOT_DIRECTORY);
    expect(fromInside.recordedInput).toBeDefined();
    expect(fromInside.warning).toBeUndefined();

    const outsideRepository = await observeExecuteRunHandler({ gitRepository: false });
    expect(outsideRepository.product.gitRepository).toBe(false);
    expect(outsideRepository.drivenRequest?.productDir).toBe(outsideRepository.invocationDir);
    expect(outsideRepository.report?.testPaths).toEqual(
      [...outsideRepository.product.testPaths].sort(compareAsciiStrings),
    );
    expect(outsideRepository.warning).toBe(EXECUTE_RUN_CLI_WARNING.NOT_GIT_REPOSITORY);

    const descriptor = await observeExecuteRunDescriptor(
      [],
      handlerReturning({ exitCode: VERIFY_CLI_EXIT_CODE.OK, warning: EXECUTE_RUN_CLI_WARNING.NOT_GIT_REPOSITORY }),
    );
    expect(descriptor.stdout).toHaveLength(0);
    expect(descriptor.stderr.trim()).toBe(EXECUTE_RUN_CLI_WARNING.NOT_GIT_REPOSITORY);
    expect(descriptor.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  });

  it("exposes no verification type as a verb command path", () => {
    const tree = inspectExecuteRunCommandTree();
    for (const forbiddenVerb of EXECUTE_RUN_CLI_SURFACE.forbiddenTypeVerbNames) {
      expect(tree.verificationChildNames).not.toContain(forbiddenVerb);
    }
  });

  it("reports one structured result with the run locator and terminal status, exiting zero exactly when passed", async () => {
    for (const invocation of invokedInvocations()) {
      const observation = await observeExecuteRunHandler({
        selectOperands: (product) => [product.nodePaths[0]],
        invocation,
      });
      if (!invocation.invoked) continue;

      expect(observation.report?.runToken).toBe(observation.report?.locator.runToken);
      expect(observation.report?.locator.verificationType).toBe(VERIFY_VERIFICATION_TYPE.TEST);
      expect(observation.report?.terminalStatus).toBe(invocation.terminalStatus);
      expect(observation.report?.unresolvedRunner).toBeUndefined();
      expect(observation.exitCode).toBe(
        invocation.terminalStatus === JOURNAL_RUN_TERMINAL_STATUS.PASSED
          ? VERIFY_CLI_EXIT_CODE.OK
          : VERIFY_CLI_EXIT_CODE.ERROR,
      );
      expect(observation.recordedInput).toBeDefined();
      expect(JSON.parse(observation.recordedInput?.content ?? "")).toMatchObject({
        verificationType: VERIFY_VERIFICATION_TYPE.TEST,
        operands: observation.operands,
        testPaths: observation.report?.testPaths,
      });
    }

    const passed = await observeExecuteRunHandler();
    const descriptor = await observeExecuteRunDescriptor(
      [],
      handlerReturning({ exitCode: passed.exitCode, report: passed.report }),
    );
    expect(descriptor.stdout.trim()).toBe(JSON.stringify(passed.report));
    expect(descriptor.stderr).toHaveLength(0);
    expect(descriptor.exitCode).toBe(passed.exitCode);
  });

  it("reports an operand selecting no test file or a type without a runner without opening a run, and names a runnerless product directory after sealing", async () => {
    const unresolvedOperand = sampleGeneratedValue(arbitrarySourceFilePath());
    const noMatch = await observeExecuteRunHandler({ selectOperands: () => [unresolvedOperand] });
    expect(noMatch.report).toBeUndefined();
    expect(noMatch.drivenRequest).toBeUndefined();
    expect(noMatch.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(noMatch.diagnostic).toContain(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_OPERANDS);
    expect(noMatch.diagnostic).toContain(unresolvedOperand);

    const agenticType = await observeExecuteRunWithAgenticType();
    expect(agenticType.report).toBeUndefined();
    expect(agenticType.drivenRequest).toBeUndefined();
    expect(agenticType.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(agenticType.diagnostic).toContain(EXECUTE_RUN_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
    expect(agenticType.diagnostic).toContain(VERIFY_VERIFICATION_TYPE.AUDIT);

    const unresolvedRunner = unresolvedRunnerInvocation();
    const runnerless = await observeExecuteRunHandler({ invocation: unresolvedRunner.invocation });
    expect(runnerless.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(runnerless.report?.unresolvedRunner).toEqual({ productDir: unresolvedRunner.productDir });
    expect(runnerless.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(runnerless.diagnostic).toContain(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_RUNNER);
    expect(runnerless.diagnostic).toContain(unresolvedRunner.productDir);

    const descriptor = await observeExecuteRunDescriptor(
      [],
      handlerReturning({ exitCode: noMatch.exitCode, diagnostic: noMatch.diagnostic }),
    );
    expect(descriptor.stdout).toHaveLength(0);
    expect(descriptor.stderr.trim()).toBe(noMatch.diagnostic);
    expect(descriptor.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  });

  it("reports a run the handler cannot complete as an escaped diagnostic carrying the failure, with a non-zero exit, never as an unhandled failure", async () => {
    const failure = sampleGeneratedValue(arbitraryTerminalUnsafeText());
    const descriptor = await observeExecuteRunDescriptor([], handlerFailingWith(failure));

    expect(descriptor.stdout).toHaveLength(0);
    expect(descriptor.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(descriptor.stderr).toContain(EXECUTE_RUN_CLI_ERROR.RUN_FAILED);
    const rendered = descriptor.stderr.replaceAll(CLI_STREAM_REPORT.LINE_SEPARATOR, "");
    for (const char of rendered) {
      expect(char.codePointAt(0)).toBeGreaterThanOrEqual(FIRST_PRINTABLE_CHAR_CODE);
      expect(char.codePointAt(0)).not.toBe(DEL_CHAR_CODE);
    }
    // Every printable character of the failure survives, in order, after the run-failed prefix: the
    // message is carried, not dropped, and only its unsafe bytes are rewritten.
    let position = rendered.indexOf(EXECUTE_RUN_CLI_ERROR.RUN_FAILED) + EXECUTE_RUN_CLI_ERROR.RUN_FAILED.length;
    for (const char of failure) {
      const codePoint = char.codePointAt(0) ?? DEL_CHAR_CODE;
      if (codePoint < FIRST_PRINTABLE_CHAR_CODE || codePoint === DEL_CHAR_CODE) continue;
      position = rendered.indexOf(char, position);
      expect(position).toBeGreaterThanOrEqual(0);
      position += char.length;
    }
  });
});
