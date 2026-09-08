/**
 * Test harness for the `spx verification <type> run` command surface
 * (`spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-execute-run.enabler`).
 *
 * The command tree is inspected on the real CLI program. The handler is driven over a temp product
 * holding generated spec-tree test files — a real git repository by default, or a bare directory
 * outside any repository — so the production worktree-root resolver is exercised, not injected;
 * the real verify recorder is wired to an in-memory state store, and a controlled streaming runner
 * yields a configured invocation (Stage 5 exception 7, a contract probe at the runner boundary) — no
 * real Vitest run at `l1`. The descriptor's process boundary is observed through recording standard
 * streams, with a handler that either returns a configured result or fails with a configured error.
 * Every function returns observations; the linked test owns every predicate.
 */
import { realpath } from "node:fs/promises";
import { join, posix } from "node:path";

import { execa } from "execa";

import {
  EXECUTABLE_VERIFICATION_TYPES,
  executeRunCommand,
  type ExecuteRunCommandResult,
  type ExecuteRunReport,
  type JournalStreamingRunner,
  resolveVerificationRunner,
} from "@/commands/verification-exec";
import { verifyInputCommand, type VerifyInputReport } from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE, type VerifyVerificationType } from "@/domains/verify/verify";
import type { Domain } from "@/interfaces/cli/domain";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { EXECUTE_RUN_CLI_SURFACE, registerVerifyCommands, VERIFICATION_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { GIT_SHOW_TOPLEVEL_ARGS, type GitDependencies } from "@/lib/git/root";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { JOURNAL_RUN_TERMINAL_STATUS, type JournalRunInvocation, type JournalRunRequest } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { GIT_TEST_COMMAND, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import {
  createVerifyRunContextScenario,
  verifyDeps,
  verifyGitDeps,
  verifyInputOptions,
  type VerifyRunContextScenario,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

/**
 * The violating command paths the verification command surface must never register — the
 * verb-shaped verification-type names `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`
 * forbids — as the compliance evidence's real violating cases.
 */
export const FORBIDDEN_TYPE_VERB_COMMAND_NAMES: readonly string[] = ["validate", "eval"];

/**
 * The violating path-scope flags no verification surface introduces —
 * `spx/29-verification-path-scope.pdr.md` names them — as the compliance evidence's real violating cases.
 */
export const FORBIDDEN_PATH_SCOPE_FLAGS: readonly string[] = ["--files", "--tests", "--nodes"];

/** One executable verification type's command subtree as the real program registers it. */
export interface TypeNounObservation {
  readonly typeName: string;
  readonly runVerbPresent: boolean;
  /** The name of the run verb's variadic positional operand, or `undefined` when it declares none. */
  readonly variadicOperandName: string | undefined;
  readonly runVerbOptionFlags: readonly string[];
}

/** The `spx verification` command tree as the real program registers it. */
export interface ExecuteRunCommandTreeObservation {
  /** The types the executor's runner registry resolves. */
  readonly executableTypes: readonly string[];
  /** The names of every child command under `spx verification`. */
  readonly verificationChildNames: readonly string[];
  /** One entry per executable type, inspected on the tree. */
  readonly typeNouns: readonly TypeNounObservation[];
}

/** Inspects the real CLI program's `spx verification` subtree for the type-noun command paths. */
export function inspectExecuteRunCommandTree(): ExecuteRunCommandTreeObservation {
  const program = createCliProgram();
  const verificationCommand = program.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
  );
  const typeNouns = EXECUTABLE_VERIFICATION_TYPES.map((typeName): TypeNounObservation => {
    const typeNounCommand = verificationCommand?.commands.find((command) => command.name() === typeName);
    const runVerbCommand = typeNounCommand?.commands.find(
      (command) => command.name() === EXECUTE_RUN_CLI_SURFACE.runVerbName,
    );
    return {
      typeName,
      runVerbPresent: runVerbCommand !== undefined,
      variadicOperandName: runVerbCommand?.registeredArguments.find((argument) => argument.variadic)?.name(),
      runVerbOptionFlags: runVerbCommand?.options.map((option) => option.flags) ?? [],
    };
  });
  return {
    executableTypes: EXECUTABLE_VERIFICATION_TYPES,
    verificationChildNames: verificationCommand?.commands.map((command) => command.name()) ?? [],
    typeNouns,
  };
}

/** A temp product's generated spec-tree layout: two distinct nodes, each holding one TypeScript test file. */
export interface GeneratedTestProduct {
  /** The product root — the canonical path of the temp directory, as git resolves it when the product is a repository. */
  readonly productDir: string;
  /** Whether the product directory was initialized as a git repository. */
  readonly gitRepository: boolean;
  /** The two nodes as product-root paths — the operand form a caller passes, e.g. `spx/<node>`. */
  readonly nodePaths: readonly [string, string];
  /** The two test files as product-root paths, one under each node's `tests/`. */
  readonly testPaths: readonly [string, string];
}

const PATH_SEPARATOR = "/";

function productRootNodePath(nodePath: string): string {
  return `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}${nodePath}`;
}

// Initializes the temp directory as a git repository when asked, so the production worktree-root
// resolver finds it, and materializes the generated test files under its spec tree.
async function materializeTestProduct(tempDir: string, gitRepository: boolean): Promise<GeneratedTestProduct> {
  if (gitRepository) await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET], { cwd: tempDir });
  const productDir = await realpath(tempDir);
  const [firstNode, secondNode] = sampleGeneratedValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
  const firstTest = sampleGeneratedValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, firstNode));
  const secondTest = sampleGeneratedValue(
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, secondNode),
  );
  await writeTestFileFixture(productDir, firstTest);
  await writeTestFileFixture(productDir, secondTest);
  return {
    productDir,
    gitRepository,
    nodePaths: [productRootNodePath(firstNode), productRootNodePath(secondNode)],
    testPaths: [firstTest, secondTest],
  };
}

/** A controlled runner yielding a configured invocation and recording the request it received. */
interface ControlledRunner {
  readonly runner: JournalStreamingRunner;
  request(): JournalRunRequest | undefined;
}

function controlledRunner(invocation: JournalRunInvocation): ControlledRunner {
  let captured: JournalRunRequest | undefined;
  return {
    runner: {
      runTestsStreaming: (request) => {
        captured = request;
        return Promise.resolve(invocation);
      },
    },
    request: () => captured,
  };
}

/** Git dependencies answering as the scenario's, recording the directory each worktree-root probe ran in. */
interface ProbeRecordingGitDeps {
  readonly git: GitDependencies;
  probeCwds(): readonly string[];
}

// The recorder resolves its store root by probing `git rev-parse --show-toplevel` from the
// directory it is rooted at; recording that directory exposes where the handler rooted the
// recorder, while the probe's answer stays the scenario's product root.
function probeRecordingGitDeps(scenario: VerifyRunContextScenario): ProbeRecordingGitDeps {
  const probeCwds: string[] = [];
  const answering = verifyGitDeps(scenario);
  return {
    git: {
      execa: (command, args, options) => {
        if (args.join(" ") === GIT_SHOW_TOPLEVEL_ARGS.join(" ") && options?.cwd !== undefined) {
          probeCwds.push(options.cwd);
        }
        return answering.execa(command, args, options);
      },
    },
    probeCwds: () => probeCwds,
  };
}

/** What one handler invocation over a generated product and a controlled runner exposes. */
export interface ExecuteRunHandlerObservation {
  readonly product: GeneratedTestProduct;
  /** The directory the handler was invoked from. */
  readonly invocationDir: string;
  /** The directories the recorder's worktree-root probes ran in during the handler's run. */
  readonly recorderProbeCwds: readonly string[];
  readonly operands: readonly string[];
  readonly invocation: JournalRunInvocation;
  readonly exitCode: number;
  readonly report: ExecuteRunReport | undefined;
  readonly diagnostic: string | undefined;
  readonly warning: string | undefined;
  /** The request the controlled runner received, or `undefined` when no run opened. */
  readonly drivenRequest: JournalRunRequest | undefined;
  /** The run input the recorder replays for the opened run, or `undefined` when no run opened. */
  readonly recordedInput: VerifyInputReport | undefined;
}

/** The product root itself — the default invocation directory. */
export function invokeFromProductRoot(product: GeneratedTestProduct): string {
  return product.productDir;
}

/** The directory of the product's first generated test file — an invocation directory inside the product. */
export function invokeFromFirstTestDir(product: GeneratedTestProduct): string {
  return join(product.productDir, posix.dirname(product.testPaths[0]));
}

/** How the handler is driven: which operands, from where, over which product, yielding which invocation. */
export interface ExecuteRunHandlerDrive {
  /** The operands to pass, chosen over the generated product; defaults to none. */
  readonly selectOperands?: (product: GeneratedTestProduct) => readonly string[];
  /** The directory to invoke from, chosen over the generated product; defaults to the product root. */
  readonly selectInvocationDir?: (product: GeneratedTestProduct) => string;
  /** Whether the generated product is a git repository; defaults to true. */
  readonly gitRepository?: boolean;
  /** The invocation the controlled runner yields; defaults to the first invoked invocation. */
  readonly invocation?: JournalRunInvocation;
}

interface ExecuteRunDrive extends Required<ExecuteRunHandlerDrive> {
  readonly verificationType: VerifyVerificationType;
  /** Resolves the runner the handler drives; the controlled runner, or the production registry. */
  readonly resolveRunner: (
    controlled: ControlledRunner,
  ) => (verificationType: string) => JournalStreamingRunner | undefined;
}

function resolvedDrive(drive: ExecuteRunHandlerDrive): Required<ExecuteRunHandlerDrive> {
  return {
    selectOperands: drive.selectOperands ?? (() => []),
    selectInvocationDir: drive.selectInvocationDir ?? invokeFromProductRoot,
    gitRepository: drive.gitRepository ?? true,
    invocation: drive.invocation ?? invokedInvocations()[0],
  };
}

/**
 * Drives the execute-run handler for the `test` type over a generated temp product with the drive's
 * operands and a controlled runner yielding the drive's invocation, from the drive's invocation
 * directory, against the real recorder over an in-memory store and the production worktree-root
 * resolver, and reads back the recorded run input when a run opened.
 */
export function observeExecuteRunHandler(drive: ExecuteRunHandlerDrive = {}): Promise<ExecuteRunHandlerObservation> {
  return driveExecuteRun({
    ...resolvedDrive(drive),
    verificationType: VERIFY_VERIFICATION_TYPE.TEST,
    resolveRunner: (controlled) => () => controlled.runner,
  });
}

/**
 * Drives the execute-run handler with an agentic verification type — one the production registry
 * resolves no streaming runner for — over the whole generated product, from its root.
 */
export function observeExecuteRunWithAgenticType(): Promise<ExecuteRunHandlerObservation> {
  return driveExecuteRun({
    ...resolvedDrive({}),
    verificationType: VERIFY_VERIFICATION_TYPE.AUDIT,
    resolveRunner: () => resolveVerificationRunner,
  });
}

async function driveExecuteRun(drive: ExecuteRunDrive): Promise<ExecuteRunHandlerObservation> {
  const { invocation } = drive;
  let observation: ExecuteRunHandlerObservation | undefined;
  await withTestingTempProductDir(async (tempDir) => {
    const product = await materializeTestProduct(tempDir, drive.gitRepository);
    const operands = drive.selectOperands(product);
    const invocationDir = drive.selectInvocationDir(product);
    const scenario = withVerificationType(
      { ...createVerifyRunContextScenario(), productDir: product.productDir },
      drive.verificationType,
    );
    const fs = createInMemoryStateStoreFileSystem();
    const probes = probeRecordingGitDeps(scenario);
    const recorderDeps = { ...verifyDeps(scenario, fs), git: probes.git };
    const controlled = controlledRunner(invocation);

    const result = await executeRunCommand(
      { verificationType: drive.verificationType, operands, recursive: false },
      { cwd: invocationDir, resolveRunner: drive.resolveRunner(controlled), recorder: recorderDeps },
    );
    const recorderProbeCwds = [...probes.probeCwds()];
    const recordedInput = result.report === undefined
      ? undefined
      : JSON.parse(
        (await verifyInputCommand(
          {
            ...verifyInputOptions(scenario, result.report.runToken),
            scopeType: VERIFY_SCOPE_TYPE.FILE,
            scope: result.report.locator.scopeIdentity,
          },
          recorderDeps,
        )).output,
      ) as VerifyInputReport;
    observation = {
      product,
      invocationDir,
      recorderProbeCwds,
      operands,
      invocation,
      exitCode: result.exitCode,
      report: result.report,
      diagnostic: result.diagnostic,
      warning: result.warning,
      drivenRequest: controlled.request(),
      recordedInput,
    };
  });
  if (observation === undefined) throw new Error("execute-run harness produced no observation");
  return observation;
}

/** Every invoked terminal status the runner vocabulary declares, as an invocation each. */
export function invokedInvocations(): readonly JournalRunInvocation[] {
  return Object.values(JOURNAL_RUN_TERMINAL_STATUS).map((terminalStatus) => ({ invoked: true, terminalStatus }));
}

/** An unresolved-runner invocation naming a generated product directory, alongside that directory. */
export function unresolvedRunnerInvocation(): {
  readonly invocation: JournalRunInvocation;
  readonly productDir: string;
} {
  const productDir = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).productDir;
  return { invocation: { invoked: false, unresolvedRunner: { productDir } }, productDir };
}

/** What the descriptor wrote to the process streams for one parsed command line. */
export interface ExecuteRunDescriptorObservation {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | undefined;
  /** The options the descriptor handed the injected handler, in invocation order. */
  readonly handlerOptions: readonly { readonly verificationType: string; readonly operands: readonly string[] }[];
}

/** What the recording handler does when the descriptor invokes it: return a result, or fail with an error. */
export type ExecuteRunHandlerOutcome =
  | { readonly kind: "result"; readonly result: ExecuteRunCommandResult }
  | { readonly kind: "failure"; readonly error: Error };

/** A handler outcome returning the given result. */
export function handlerReturning(result: ExecuteRunCommandResult): ExecuteRunHandlerOutcome {
  return { kind: "result", result };
}

/** A handler outcome failing with an error carrying the given message. */
export function handlerFailingWith(message: string): ExecuteRunHandlerOutcome {
  return { kind: "failure", error: new Error(message) };
}

const RECORD_RUN_HANDLER_NOT_UNDER_TEST = "record-run handler not under test";

/**
 * Parses `spx verification <type> run <operands…>` on a program whose execute-run handler is a
 * recording double with the given outcome, and observes what reached the process streams.
 */
export async function observeExecuteRunDescriptor(
  operands: readonly string[],
  handlerOutcome: ExecuteRunHandlerOutcome,
): Promise<ExecuteRunDescriptorObservation> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;
  const handlerOptions: { verificationType: string; operands: readonly string[] }[] = [];
  const recordingDomain: Domain = {
    name: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    description: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    register: (program, invocation) => {
      registerVerifyCommands(program, invocation, {
        appendFinding: () => Promise.reject(new Error(RECORD_RUN_HANDLER_NOT_UNDER_TEST)),
        appendScope: () => Promise.reject(new Error(RECORD_RUN_HANDLER_NOT_UNDER_TEST)),
        executeRun: (options) => {
          handlerOptions.push({ verificationType: options.verificationType, operands: options.operands });
          return handlerOutcome.kind === "result"
            ? Promise.resolve(handlerOutcome.result)
            : Promise.reject(handlerOutcome.error);
        },
        finish: () => Promise.reject(new Error(RECORD_RUN_HANDLER_NOT_UNDER_TEST)),
        input: () => Promise.reject(new Error(RECORD_RUN_HANDLER_NOT_UNDER_TEST)),
        render: () => Promise.reject(new Error(RECORD_RUN_HANDLER_NOT_UNDER_TEST)),
        start: () => Promise.reject(new Error(RECORD_RUN_HANDLER_NOT_UNDER_TEST)),
        status: () => Promise.reject(new Error(RECORD_RUN_HANDLER_NOT_UNDER_TEST)),
      });
    },
  };
  await withTestingTempProductDir(async (productDir) => {
    const program = createCliProgram({
      domains: [recordingDomain],
      processCwd: () => productDir,
      writeStdout: (output) => stdout.push(output),
      writeStderr: (output) => stderr.push(output),
      setExitCode: (code) => {
        exitCode = code;
      },
    });
    await program.parseAsync(
      [
        VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
        VERIFY_VERIFICATION_TYPE.TEST,
        EXECUTE_RUN_CLI_SURFACE.runVerbName,
        ...operands,
      ],
      { from: SPX_COMMANDER_PARSE_SOURCE },
    );
  });
  return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode, handlerOptions };
}
