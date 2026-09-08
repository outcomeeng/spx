/**
 * Test harness for the `spx verification <type> run` command surface
 * (`spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-execute-run.enabler`).
 *
 * The command tree is inspected on the real CLI program. The handler is driven over a temp product
 * holding generated spec-tree test files, the real verify recorder wired to an in-memory state store,
 * and a controlled streaming runner that yields a configured invocation (Stage 5 exception 7, a
 * contract probe at the runner boundary) — no real Vitest run at `l1`. The descriptor's process
 * boundary is observed through recording standard streams. Every function returns observations; the
 * linked test owns every predicate.
 */
import {
  EXECUTABLE_VERIFICATION_TYPES,
  executeRunCommand,
  type ExecuteRunReport,
  type JournalStreamingRunner,
} from "@/commands/verification-exec";
import { verifyInputCommand, type VerifyInputReport } from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import type { Domain } from "@/interfaces/cli/domain";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { EXECUTE_RUN_CLI_SURFACE, registerVerifyCommands, VERIFICATION_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { JOURNAL_RUN_TERMINAL_STATUS, type JournalRunInvocation, type JournalRunRequest } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import {
  createVerifyRunContextScenario,
  verifyDeps,
  verifyInputOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

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
  readonly productDir: string;
  /** The two nodes as product-root paths — the operand form a caller passes, e.g. `spx/<node>`. */
  readonly nodePaths: readonly [string, string];
  /** The two test files as product-root paths, one under each node's `tests/`. */
  readonly testPaths: readonly [string, string];
}

const PATH_SEPARATOR = "/";

function productRootNodePath(nodePath: string): string {
  return `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}${nodePath}`;
}

async function materializeTestProduct(productDir: string): Promise<GeneratedTestProduct> {
  const [firstNode, secondNode] = sampleGeneratedValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
  const firstTest = sampleGeneratedValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, firstNode));
  const secondTest = sampleGeneratedValue(
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, secondNode),
  );
  await writeTestFileFixture(productDir, firstTest);
  await writeTestFileFixture(productDir, secondTest);
  return {
    productDir,
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

/** What one handler invocation over a generated product and a controlled runner exposes. */
export interface ExecuteRunHandlerObservation {
  readonly product: GeneratedTestProduct;
  readonly operands: readonly string[];
  readonly invocation: JournalRunInvocation;
  readonly exitCode: number;
  readonly report: ExecuteRunReport | undefined;
  readonly diagnostic: string | undefined;
  /** The request the controlled runner received, or `undefined` when no run opened. */
  readonly drivenRequest: JournalRunRequest | undefined;
  /** The run input the recorder replays for the opened run, or `undefined` when no run opened. */
  readonly recordedInput: VerifyInputReport | undefined;
}

/**
 * Drives the execute-run handler over a generated temp product with the given operands and a
 * controlled runner yielding the given invocation, against the real recorder over an in-memory
 * store, and reads back the recorded run input when a run opened.
 */
export async function observeExecuteRunHandler(
  selectOperands: (product: GeneratedTestProduct) => readonly string[],
  invocation: JournalRunInvocation,
): Promise<ExecuteRunHandlerObservation> {
  let observation: ExecuteRunHandlerObservation | undefined;
  await withTestingTempProductDir(async (productDir) => {
    const product = await materializeTestProduct(productDir);
    const operands = selectOperands(product);
    const scenario = withVerificationType(
      { ...createVerifyRunContextScenario(), productDir },
      VERIFY_VERIFICATION_TYPE.TEST,
    );
    const fs = createInMemoryStateStoreFileSystem();
    const recorderDeps = verifyDeps(scenario, fs);
    const controlled = controlledRunner(invocation);

    const result = await executeRunCommand(
      { verificationType: VERIFY_VERIFICATION_TYPE.TEST, operands, recursive: false },
      { cwd: productDir, resolveRunner: () => controlled.runner, recorder: recorderDeps },
    );
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
      operands,
      invocation,
      exitCode: result.exitCode,
      report: result.report,
      diagnostic: result.diagnostic,
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

/**
 * Parses `spx verification <type> run <operands…>` on a program whose execute-run handler is a
 * recording double returning the given handler result, and observes what reached the process streams.
 */
export async function observeExecuteRunDescriptor(
  operands: readonly string[],
  handlerResult: { readonly exitCode: number; readonly report?: ExecuteRunReport; readonly diagnostic?: string },
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
        appendFinding: () => Promise.reject(new Error("record-run handler not under test")),
        appendScope: () => Promise.reject(new Error("record-run handler not under test")),
        executeRun: (options) => {
          handlerOptions.push({ verificationType: options.verificationType, operands: options.operands });
          return Promise.resolve(handlerResult);
        },
        finish: () => Promise.reject(new Error("record-run handler not under test")),
        input: () => Promise.reject(new Error("record-run handler not under test")),
        render: () => Promise.reject(new Error("record-run handler not under test")),
        start: () => Promise.reject(new Error("record-run handler not under test")),
        status: () => Promise.reject(new Error("record-run handler not under test")),
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
