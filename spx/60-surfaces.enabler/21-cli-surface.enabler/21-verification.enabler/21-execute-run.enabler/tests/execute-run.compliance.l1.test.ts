import { posix } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXECUTE_RUN_CLI_ERROR,
  EXECUTE_RUN_CLI_WARNING,
  EXECUTE_RUN_CLI_WARNING_TEXT,
  RECORDER_OPERATION_ERROR,
} from "@/commands/verification-exec";
import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { PATH_OPERAND_CLI_SURFACE, recursiveOptionFlags } from "@/interfaces/cli/lib/path-operands";
import { EXECUTE_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { TARGET_OPERAND } from "@/lib/test-targeting";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryTerminalEscapingCase } from "@testing/generators/terminal-text/terminal-text";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import {
  handlerFailingWith,
  handlerReturning,
  inspectExecuteRunCommandTree,
  invokedInvocations,
  invokeFromFirstTestDir,
  observeExecuteRunDescriptor,
  observeExecuteRunDescriptorThroughFailure,
  observeExecuteRunHandler,
  observeExecuteRunHandlerFailure,
  observeExecuteRunThroughLinkedWorktree,
  observeExecuteRunThroughProduction,
  observeExecuteRunWithAgenticType,
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
      for (const forbiddenFlag of PATH_OPERAND_CLI_SURFACE.forbiddenPathScopeFlags) {
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
    expect(twoNodes.report?.testPaths).toEqual(
      [twoNodes.product.testPaths[0], twoNodes.product.testPaths[1]].sort(compareAsciiStrings),
    );
    const enclosing = twoNodes.report?.locator.scopeIdentity ?? "";
    const remainders = twoNodes.product.nodePaths.map((nodePath) => {
      expect(nodePath === enclosing || nodePath.startsWith(`${enclosing}${posix.sep}`)).toBe(true);
      return posix.relative(enclosing, nodePath).split(posix.sep)[0];
    });
    expect(new Set(remainders).size).toBe(remainders.length);

    // The same node operand without the modifier selects only the node's own tests, leaving its
    // descendant node's out.
    const descendantExcluded = await observeExecuteRunHandler({
      selectOperands: (product) => [product.nodePaths[1]],
    });
    expect(descendantExcluded.diagnostic).toBeUndefined();
    expect(descendantExcluded.report?.testPaths).toEqual([descendantExcluded.product.testPaths[1]]);

    // The recursive modifier widens that operand to the node's whole subtree, so the descendant
    // node's test joins the selection; the node still encloses every file, so it stays the selector.
    const recursiveNode = await observeExecuteRunHandler({
      selectOperands: (product) => [product.nodePaths[1]],
      recursive: true,
    });
    expect(recursiveNode.recursive).toBe(true);
    expect(recursiveNode.diagnostic).toBeUndefined();
    expect(recursiveNode.report?.testPaths).toEqual(
      [recursiveNode.product.testPaths[1], recursiveNode.product.testPaths[2]].sort(compareAsciiStrings),
    );
    expect(recursiveNode.drivenRequest?.testPaths).toEqual(recursiveNode.report?.testPaths);
    expect(recursiveNode.report?.locator.scopeIdentity).toBe(recursiveNode.product.nodePaths[1]);
    expect(recursiveNode.product.descendantNodePath.startsWith(`${recursiveNode.product.nodePaths[1]}${posix.sep}`))
      .toBe(true);

    // The product-root operand encloses the whole tree, so whether or not it recurses it selects
    // every discovered file and records the same selector the operandless invocation records — it
    // narrows nothing.
    for (const recursive of [false, true]) {
      const rootOperand = await observeExecuteRunHandler({
        selectOperands: () => [TARGET_OPERAND.PRODUCT_ROOT],
        recursive,
      });
      expect(rootOperand.diagnostic).toBeUndefined();
      expect(rootOperand.report?.testPaths).toEqual([...rootOperand.product.testPaths].sort(compareAsciiStrings));
      expect(rootOperand.report?.locator.scopeIdentity).toBe(SPEC_TREE_CONFIG.ROOT_DIRECTORY);
      expect(rootOperand.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    }

    const descriptor = await observeExecuteRunDescriptor(
      fileOperand.product.testPaths,
      handlerReturning({ exitCode: VERIFY_CLI_EXIT_CODE.OK }),
    );
    expect(descriptor.handlerOptions).toEqual([
      { verificationType: VERIFY_VERIFICATION_TYPE.TEST, operands: fileOperand.product.testPaths, recursive: false },
    ]);

    // The run verb registers the shared recursive modifier, and either spelling reaches the handler
    // as the widened selection beside the operands.
    for (const noun of tree.typeNouns) {
      expect(noun.runVerbOptionFlags).toContain(recursiveOptionFlags());
    }
    for (const flag of [PATH_OPERAND_CLI_SURFACE.recursiveLongFlag, PATH_OPERAND_CLI_SURFACE.recursiveShortFlag]) {
      const widened = await observeExecuteRunDescriptor(
        [flag, ...fileOperand.product.nodePaths],
        handlerReturning({ exitCode: VERIFY_CLI_EXIT_CODE.OK }),
      );
      expect(widened.handlerOptions).toEqual([
        { verificationType: VERIFY_VERIFICATION_TYPE.TEST, operands: fileOperand.product.nodePaths, recursive: true },
      ]);
    }
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

    // The whole production command path — the descriptor's own dependency composition and default
    // handler binding, the real recorder over the product's store, and the production runner
    // registry — settles on the product root from a nested invocation directory with nothing
    // beneath the program injected: the registry's runner finds no Vitest in that product, so the
    // sealed run names the root the command resolved.
    const production = await observeExecuteRunThroughProduction(invokeFromFirstTestDir);
    expect(production.invocationDir).not.toBe(production.product.productDir);
    expect(production.report?.unresolvedRunner?.productDir).toBe(production.product.productDir);
    expect(production.report?.locator.scopeIdentity).toBe(SPEC_TREE_CONFIG.ROOT_DIRECTORY);
    expect(production.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(production.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(production.recordedRuns).toEqual([{ runToken: production.report?.runToken, sealed: true }]);

    // From a linked worktree the two roots part ways as the worktree-management decision declares:
    // discovery and the runner take the linked worktree's own root, while the recorder's
    // branch-scoped store resolves to the common-dir root the worktrees share, so the sealed run
    // file lands under the main checkout and nowhere under the linked one.
    const linked = await observeExecuteRunThroughLinkedWorktree();
    expect(linked.linkedDir).not.toBe(linked.mainDir);
    expect(linked.invocationDir.startsWith(linked.linkedDir)).toBe(true);
    expect(linked.report?.unresolvedRunner?.productDir).toBe(linked.linkedDir);
    expect(linked.mainRecordedRuns).toEqual([{ runToken: linked.report?.runToken, sealed: true }]);
    expect(linked.linkedRecordedRuns).toEqual([]);

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
    for (const forbiddenVerb of EXECUTE_RUN_CLI_SURFACE.forbiddenTypeVerbCommandNames) {
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
        recursive: observation.recursive,
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
    expect(noMatch.recordedRuns).toEqual([]);
    expect(noMatch.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(noMatch.diagnostic).toContain(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_OPERANDS);
    expect(noMatch.diagnostic).toContain(unresolvedOperand);

    const agenticType = await observeExecuteRunWithAgenticType();
    expect(agenticType.report).toBeUndefined();
    expect(agenticType.drivenRequest).toBeUndefined();
    expect(agenticType.recordedRuns).toEqual([]);
    expect(agenticType.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(agenticType.diagnostic).toContain(EXECUTE_RUN_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
    expect(agenticType.diagnostic).toContain(VERIFY_VERIFICATION_TYPE.AUDIT);

    const searchedDir = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).productDir;
    const runnerless = await observeExecuteRunHandler({
      invocation: { invoked: false, unresolvedRunner: { productDir: searchedDir } },
    });
    expect(runnerless.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(runnerless.report?.unresolvedRunner).toEqual({ productDir: searchedDir });
    expect(runnerless.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(runnerless.diagnostic).toContain(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_RUNNER);
    expect(runnerless.diagnostic).toContain(searchedDir);
    // The runnerless run is the one the store holds, and it is sealed before the result reports it.
    expect(runnerless.recordedRuns).toEqual([{ runToken: runnerless.report?.runToken, sealed: true }]);

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

    // A runner failure crosses the handler as a rejection carrying the runner's own error, after the
    // opened run is sealed — so no run is left open and no failure is folded into a result.
    const runner = await observeExecuteRunHandlerFailure({ runnerFailure: new Error(failure.input) });
    expect(runner.drivenRequest).toBeDefined();
    expect(runner.rejection).toBeInstanceOf(Error);
    expect((runner.rejection as Error).message).toBe(failure.input);
    expect(runner.recordedRuns).toHaveLength(1);
    expect(runner.recordedRuns[0]?.sealed).toBe(true);

    // A recorder failure — the store refusing every write — crosses the handler the same way: the
    // run never opens, the runner is never driven, and the rejection names the failed operation.
    const recorder = await observeExecuteRunHandlerFailure({ recorderFailure: new Error(failure.input) });
    expect(recorder.drivenRequest).toBeUndefined();
    expect(recorder.rejection).toBeInstanceOf(Error);
    expect((recorder.rejection as Error).message).toContain(RECORDER_OPERATION_ERROR.OPEN_FAILED);
    expect(recorder.recordedRuns).toEqual([]);

    // Either failure, crossing the real handler beneath the real descriptor, reaches the process
    // boundary as the run-failed diagnostic with the error exit code and nothing on standard output.
    for (
      const origin of [
        { runnerFailure: new Error(failure.input) },
        { recorderFailure: new Error(failure.input) },
      ]
    ) {
      const descriptor = await observeExecuteRunDescriptorThroughFailure(origin);
      expect(descriptor.stdout).toHaveLength(0);
      expect(descriptor.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(descriptor.stderr).toContain(EXECUTE_RUN_CLI_ERROR.RUN_FAILED);
      expect(descriptor.recordedRuns.every((run) => run.sealed)).toBe(true);
    }

    // The rendering the generator derives independently of the product's escaper is what reaches
    // the stream, and the caught message's own terminal-unsafe bytes never do.
    const escaped = await observeExecuteRunDescriptorThroughFailure({ runnerFailure: new Error(failure.input) });
    expect(escaped.stderr).toContain(failure.escaped);
    expect(escaped.stderr).not.toContain(failure.input);

    // The descriptor's own catch renders any propagated failure the same way, whatever produced it.
    const propagated = await observeExecuteRunDescriptor([], handlerFailingWith(failure.input));
    expect(propagated.stdout).toHaveLength(0);
    expect(propagated.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(propagated.stderr).toContain(failure.escaped);
  });
});
