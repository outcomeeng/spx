import { posix } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXECUTE_RUN_CLI_ERROR,
  EXECUTE_RUN_CLI_WARNING,
  EXECUTE_RUN_CLI_WARNING_TEXT,
} from "@/commands/verification-exec";
import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryTerminalEscapingCase } from "@testing/generators/terminal-text/terminal-text";
import {
  FORBIDDEN_PATH_SCOPE_FLAGS,
  FORBIDDEN_TYPE_VERB_COMMAND_NAMES,
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
      for (const forbiddenFlag of FORBIDDEN_PATH_SCOPE_FLAGS) {
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

    // A file operand beside its own node operand narrows to that node: the node encloses its tests directory.
    const fileBesideNode = await observeExecuteRunHandler({
      selectOperands: (product) => [product.testPaths[0], product.nodePaths[0]],
    });
    expect(fileBesideNode.diagnostic).toBeUndefined();
    expect(fileBesideNode.report?.testPaths).toEqual([fileBesideNode.product.testPaths[0]]);
    expect(fileBesideNode.report?.locator.scopeIdentity).toBe(fileBesideNode.product.nodePaths[0]);

    // Two operands in distinct nodes narrow to the deepest directory enclosing both: every operand
    // sits under it, and the operands part ways at the very next segment.
    const twoNodes = await observeExecuteRunHandler({
      selectOperands: (product) => [product.nodePaths[0], product.nodePaths[1]],
    });
    expect(twoNodes.diagnostic).toBeUndefined();
    expect(twoNodes.report?.testPaths).toEqual([...twoNodes.product.testPaths].sort(compareAsciiStrings));
    const enclosing = twoNodes.report?.locator.scopeIdentity ?? "";
    const remainders = twoNodes.product.nodePaths.map((nodePath) => {
      expect(nodePath === enclosing || nodePath.startsWith(`${enclosing}${posix.sep}`)).toBe(true);
      return posix.relative(enclosing, nodePath).split(posix.sep)[0];
    });
    expect(new Set(remainders).size).toBe(remainders.length);

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
      handlerReturning({ exitCode: VERIFY_CLI_EXIT_CODE.OK, warning: EXECUTE_RUN_CLI_WARNING_TEXT.NOT_GIT_REPOSITORY }),
    );
    expect(descriptor.stdout).toHaveLength(0);
    expect(descriptor.stderr.trim()).toBe(EXECUTE_RUN_CLI_WARNING.NOT_GIT_REPOSITORY);
    expect(descriptor.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  });

  it("exposes no verification type as a verb command path", () => {
    const tree = inspectExecuteRunCommandTree();
    for (const forbiddenVerb of FORBIDDEN_TYPE_VERB_COMMAND_NAMES) {
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
    const failure = sampleGeneratedValue(arbitraryTerminalEscapingCase());
    const descriptor = await observeExecuteRunDescriptor([], handlerFailingWith(failure.input));

    expect(descriptor.stdout).toHaveLength(0);
    expect(descriptor.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(descriptor.stderr).toContain(EXECUTE_RUN_CLI_ERROR.RUN_FAILED);
    // The rendering the generator derives independently of the product's escaper is what reaches
    // the stream, and the caught message's own terminal-unsafe bytes never do.
    expect(descriptor.stderr).toContain(failure.escaped);
    expect(descriptor.stderr).not.toContain(failure.input);
  });
});
