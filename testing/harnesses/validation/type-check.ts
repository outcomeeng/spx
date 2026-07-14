import { EventEmitter } from "node:events";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { execa } from "execa";
import * as fc from "fast-check";
import { expect, it } from "vitest";

import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import {
  TYPESCRIPT_TOOL_DISCOVERY,
  TYPESCRIPT_VALIDATION_MESSAGES,
  typescriptCommand,
  type TypeScriptCommandDeps,
} from "@/commands/validation/typescript";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { EPIPE_CODE, EPIPE_EXIT_CODE, SIGTERM_NAME, UNCAUGHT_EVENT_NAME } from "@/lib/process-lifecycle";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { detectTypeScript, discoverTool, type ToolDiscoveryDeps } from "@/validation/discovery";
import {
  TYPESCRIPT_VALIDATION_CONCERN,
  TYPESCRIPT_VALIDATION_STAGE_BY_CONCERN,
} from "@/validation/languages/typescript";
import { validationPipelineStages } from "@/validation/registry";
import {
  forwardValidationSubprocessOutput,
  VALIDATION_SUBPROCESS_EVENTS,
  type ValidationWritableStream,
} from "@/validation/steps/subprocess-output";
import { validateTypeScript } from "@/validation/steps/typescript";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  arbitraryDomainLiteral,
  LITERAL_TEST_GENERATOR,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { CLI_PATH } from "@testing/harnesses/constants";
import { runSpawnFixture, SPAWN_FIXTURE_STREAM_EVENTS } from "@testing/harnesses/process-lifecycle/spawn-fixture";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  RecordingValidationChild,
  RejectingUnexpectedValidationSpawnRunner,
} from "@testing/harnesses/validation/subprocess";
import { HARNESS_TIMEOUT, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const EXPECTED_PIPED_STDIO = "pipe";
const CONTROLLED_TSC_EXECUTABLE_MODE = 0o755;
const CONTROLLED_TSC_WRITE_INTERVAL_MS = 1;
const CONTROLLED_TSC_SAFETY_TIMEOUT_MS = 2_000;
const CONTROLLED_TSC_EXIT_POLL_INTERVAL_MS = 10;
const CONTROLLED_TSC_EXIT_POLL_TIMEOUT_MS = CONTROLLED_TSC_SAFETY_TIMEOUT_MS + 1_000;
const CONTROLLED_TSC_SHEBANG = "#!/usr/bin/env node";
const CONTROLLED_TSC_FILESYSTEM_MODULE = "node:fs";
const CONTROLLED_TSC_STATE_FIELDS = {
  EXIT_OBSERVED: "exitObserved",
  STARTED_PID: "startedPid",
  TERMINATION_SIGNAL: "terminationSignal",
} as const;

interface ControlledTscState {
  readonly exitObserved: boolean;
  readonly startedPid: number;
  readonly terminationSignal: NodeJS.Signals | null;
}

class RecordingWritable implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return true;
  }
}

class BackpressuredWritable extends EventEmitter implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return false;
  }
}

export function registerTypeCheckScenarioTests(): void {
  it(
    "S1: GIVEN a TypeScript product with valid types WHEN running typescript THEN tsc exits zero",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await runTypeScriptValidation(path);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.TOOL_LABEL);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
        expect(result.stdout).not.toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
      });
    },
  );

  it(
    "S2: GIVEN a project where TypeScript is absent WHEN running typescript THEN tsc does not execute and no npx prompt appears",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
        expectTypeScriptAbsent(await runTypeScriptValidation(path));
      });
    },
  );

  it(
    "S3: GIVEN a TypeScript product with type errors WHEN running typescript THEN exits non-zero and reports errors",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
        const result = await runTypeScriptValidation(path);

        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).not.toMatch(/error TS\d+:/u);
        expect(result.stderr).toMatch(/error TS\d+:/u);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
      });
    },
  );

  it(
    "S3: GIVEN a directory operand and default TypeScript includes WHEN the directory has type errors THEN exits non-zero",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const apiDirectory = join(
          VALIDATION_PIPELINE_DATA.sourceDirectoryName,
          VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
        );
        await mkdir(join(path, apiDirectory), { recursive: true });
        await writeFile(
          join(path, apiDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
          VALIDATION_PIPELINE_DATA.secondaryTypeErrorSourceContent,
        );
        const tsconfigWithDefaultIncludes = JSON.parse(
          await readFile(join(path, TSCONFIG_FILES.full), VALIDATION_PIPELINE_DATA.fixtureTextEncoding),
        ) as { include?: unknown };
        delete tsconfigWithDefaultIncludes.include;
        await writeFile(join(path, TSCONFIG_FILES.full), JSON.stringify(tsconfigWithDefaultIncludes));

        const result = await runTypeScriptValidation(path, [apiDirectory]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(TYPESCRIPT_VALIDATION_MESSAGES.TOOL_LABEL);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
      });
    },
  );

  it(
    "C1: GIVEN a Python-only project WHEN running typescript THEN tsc is gated off by detectTypeScript",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.PYTHON_PROJECT }, async ({ path }) => {
        expectTypeScriptAbsent(await runTypeScriptValidation(path));
      });
    },
  );

  it(
    "C2: GIVEN .ts files present but no tsconfig.json WHEN running typescript THEN tsc does not execute and no npx prompt appears",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
        expectTypeScriptAbsent(await runTypeScriptValidation(path));
      });
    },
  );
}

export function registerTypeCheckComplianceTests(): void {
  it("gates TypeScript discovery and execution when the product has no tsconfig", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
      const detectionCalls: string[] = [];
      const deps: TypeScriptCommandDeps = {
        detectTypeScript: (productDir) => {
          detectionCalls.push(productDir);
          return detectTypeScript(productDir);
        },
        discoverTool: async () => {
          throw new Error("TypeScript discovery ran for an absent language");
        },
        validateTypeScript: async () => {
          throw new Error("TypeScript validation ran for an absent language");
        },
      };

      const result = await typescriptCommand({ cwd: path }, deps);

      expect(result.exitCode).toBe(0);
      expect(detectionCalls).toEqual([path]);
      expect(result.output).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
      expect(result.output).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
    });
  });

  it("gates TypeScript discovery and execution when TypeScript files exist without a tsconfig", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
      const detectionCalls: string[] = [];
      const deps: TypeScriptCommandDeps = {
        detectTypeScript: (productDir) => {
          detectionCalls.push(productDir);
          return detectTypeScript(productDir);
        },
        discoverTool: async () => {
          throw new Error("TypeScript discovery ran without a tsconfig");
        },
        validateTypeScript: async () => {
          throw new Error("TypeScript validation ran without a tsconfig");
        },
      };

      const result = await typescriptCommand({ cwd: path }, deps);

      expect(result.exitCode).toBe(0);
      expect(detectionCalls).toEqual([path]);
      expect(result.output).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
    });
  });

  it("terminates through the lifecycle handler when the TypeScript output consumer closes", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
      const marker = sampleLiteralTestValue(arbitraryDomainLiteral());
      const statePath = join(path, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));
      await installControlledTsc(path, statePath, marker);

      const result = await runSpawnFixture({
        command: process.execPath,
        args: validationTypeScriptOnlyPipelineArgs(),
        cwd: path,
        destroyStdoutAfterMarker: marker,
      });
      const state = await waitForControlledTscExit(statePath);

      expect(result.stdoutMarkerObserved).toBe(true);
      expect(result.exitCode).toBe(EPIPE_EXIT_CODE);
      expect(result.stderr).not.toContain(UNCAUGHT_EVENT_NAME);
      expect(result.stderr).not.toContain(EPIPE_CODE);
      expect(state.terminationSignal).toBe(SIGTERM_NAME);
      expect(state.exitObserved).toBe(true);
    });
  });

  it("spawns tsc with piped stdio so lifecycle handlers can observe parent output closure", async () => {
    const toolPath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const runner = new RejectingUnexpectedValidationSpawnRunner({
      command: toolPath,
      stdio: EXPECTED_PIPED_STDIO,
    });
    const result = await validateTypeScript(
      { scope: VALIDATION_SCOPES.FULL, productDir: process.cwd() },
      { runner, toolPath },
    );

    expect(result.success).toBe(true);
    expect(runner.commands).toEqual([toolPath]);
    expect(runner.spawnOptions?.stdio).toEqual(EXPECTED_PIPED_STDIO);
  });

  it("spawns the product-first executable returned by TypeScript command discovery", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
      const toolPath = join(path, ...TYPESCRIPT_TOOL_DISCOVERY.PRODUCT_EXECUTABLE_SEGMENTS);
      const bundledToolPath = join(path, TYPESCRIPT_TOOL_DISCOVERY.BUNDLED_EXECUTABLE);
      const discoveryDeps: ToolDiscoveryDeps = {
        resolveModule: (specifier) =>
          specifier === TYPESCRIPT_TOOL_DISCOVERY.BUNDLED_EXECUTABLE
            ? bundledToolPath
            : null,
        resolveImport: () => null,
        existsSync: (candidate) => candidate === toolPath,
        whichSync: () => null,
      };
      const runner = new RejectingUnexpectedValidationSpawnRunner({
        command: toolPath,
        stdio: EXPECTED_PIPED_STDIO,
      });
      const deps: TypeScriptCommandDeps = {
        detectTypeScript,
        discoverTool: (tool, options) => discoverTool(tool, { ...options, deps: discoveryDeps }),
        validateTypeScript: (context, options) => validateTypeScript(context, { ...options, runner }),
      };

      const result = await typescriptCommand({ cwd: path, quiet: true }, deps);

      expect(result.exitCode).toBe(0);
      expect(runner.commands).toEqual([toolPath]);
    });
  });

  it("forwards child stdout and stderr chunks through injected parent streams", () => {
    assertProperty(
      fc.tuple(arbitraryDomainLiteral(), arbitraryDomainLiteral()),
      ([stdoutChunk, stderrChunk]) => {
        const child = new RecordingValidationChild();
        const stdout = new RecordingWritable();
        const stderr = new RecordingWritable();

        forwardValidationSubprocessOutput(child, { stdout, stderr });
        child.stdout.write(stdoutChunk);
        child.stderr.write(stderrChunk);

        expect(stdout.chunks).toEqual([stdoutChunk]);
        expect(stderr.chunks).toEqual([stderrChunk]);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("pauses child output until the parent stream drains", () => {
    assertProperty(
      arbitraryDomainLiteral(),
      (stdoutChunk) => {
        const child = new RecordingValidationChild();
        const stdout = new BackpressuredWritable();
        const stderr = new RecordingWritable();

        forwardValidationSubprocessOutput(child, { stdout, stderr });
        child.stdout.write(stdoutChunk);
        expect(child.stdout.isPaused()).toBe(true);

        stdout.emit(VALIDATION_SUBPROCESS_EVENTS.DRAIN);
        expect(child.stdout.isPaused()).toBe(false);
        expect(stdout.chunks).toEqual([stdoutChunk]);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
}

function validationTypeScriptOnlyPipelineArgs(): string[] {
  const typeScriptStageName = TYPESCRIPT_VALIDATION_STAGE_BY_CONCERN[TYPESCRIPT_VALIDATION_CONCERN.TYPE_CHECK];
  const unrelatedStageOverrides = validationPipelineStages
    .filter((stage) => stage.name !== typeScriptStageName)
    .map((stage) => stage.participation.override.flag);
  return [
    CLI_PATH,
    validationCliDefinition.domain.commandName,
    validationCliDefinition.subcommands.all.commandName,
    ...unrelatedStageOverrides,
  ];
}

function validationTypeScriptAliasArgs(): string[] {
  const alias = validationCliDefinition.subcommands.typescript.alias;
  if (alias === undefined) throw new Error("TypeScript validation alias is not registered");
  return [CLI_PATH, validationCliDefinition.domain.commandName, alias];
}

async function installControlledTsc(productDir: string, statePath: string, marker: string): Promise<void> {
  const toolPath = join(productDir, ...TYPESCRIPT_TOOL_DISCOVERY.PRODUCT_EXECUTABLE_SEGMENTS);
  await unlink(dirname(dirname(toolPath)));
  await mkdir(dirname(toolPath), { recursive: true });
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(
    toolPath,
    createControlledTscScript(statePath, marker),
    VALIDATION_PIPELINE_DATA.fixtureTextEncoding,
  );
  await chmod(toolPath, CONTROLLED_TSC_EXECUTABLE_MODE);
}

function createControlledTscScript(statePath: string, marker: string): string {
  const statePathLiteral = JSON.stringify(statePath);
  const markerLiteral = JSON.stringify(marker);
  const filesystemModuleLiteral = JSON.stringify(CONTROLLED_TSC_FILESYSTEM_MODULE);
  const stdoutErrorEventLiteral = JSON.stringify(SPAWN_FIXTURE_STREAM_EVENTS.ERROR);
  const processExitEventLiteral = JSON.stringify(SPAWN_FIXTURE_STREAM_EVENTS.EXIT);
  const terminationSignalLiteral = JSON.stringify(SIGTERM_NAME);
  const startedPidFieldLiteral = JSON.stringify(CONTROLLED_TSC_STATE_FIELDS.STARTED_PID);
  const terminationSignalFieldLiteral = JSON.stringify(CONTROLLED_TSC_STATE_FIELDS.TERMINATION_SIGNAL);
  const exitObservedFieldLiteral = JSON.stringify(CONTROLLED_TSC_STATE_FIELDS.EXIT_OBSERVED);

  return [
    CONTROLLED_TSC_SHEBANG,
    `const { writeFileSync } = require(${filesystemModuleLiteral});`,
    `const statePath = ${statePathLiteral};`,
    "let terminationSignal = null;",
    `const persist = (exitObserved) => writeFileSync(statePath, JSON.stringify({ [${startedPidFieldLiteral}]: process.pid, [${terminationSignalFieldLiteral}]: terminationSignal, [${exitObservedFieldLiteral}]: exitObserved }));`,
    "persist(false);",
    `process.stdout.on(${stdoutErrorEventLiteral}, () => {});`,
    `process.on(${processExitEventLiteral}, () => persist(true));`,
    `process.on(${terminationSignalLiteral}, () => { terminationSignal = ${terminationSignalLiteral}; process.exit(${EPIPE_EXIT_CODE}); });`,
    `const writer = setInterval(() => process.stdout.write(${markerLiteral}), ${CONTROLLED_TSC_WRITE_INTERVAL_MS});`,
    `setTimeout(() => { clearInterval(writer); process.exit(${EPIPE_EXIT_CODE}); }, ${CONTROLLED_TSC_SAFETY_TIMEOUT_MS});`,
    `process.stdout.write(${markerLiteral});`,
  ].join("\n");
}

async function waitForControlledTscExit(statePath: string): Promise<ControlledTscState> {
  const deadline = Date.now() + CONTROLLED_TSC_EXIT_POLL_TIMEOUT_MS;
  let state = await readControlledTscState(statePath);
  while (!state.exitObserved && Date.now() < deadline) {
    await delay(CONTROLLED_TSC_EXIT_POLL_INTERVAL_MS);
    state = await readControlledTscState(statePath);
  }
  if (!state.exitObserved) {
    throw new Error(`Controlled tsc did not exit before its safety deadline: ${statePath}`);
  }
  return state;
}

async function readControlledTscState(statePath: string): Promise<ControlledTscState> {
  const parsed: unknown = JSON.parse(
    await readFile(statePath, VALIDATION_PIPELINE_DATA.fixtureTextEncoding),
  );
  if (!isControlledTscState(parsed)) {
    throw new Error(`Controlled tsc wrote invalid lifecycle state: ${statePath}`);
  }
  return parsed;
}

function isControlledTscState(value: unknown): value is ControlledTscState {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const startedPidField = CONTROLLED_TSC_STATE_FIELDS.STARTED_PID;
  const terminationSignalField = CONTROLLED_TSC_STATE_FIELDS.TERMINATION_SIGNAL;
  const exitObservedField = CONTROLLED_TSC_STATE_FIELDS.EXIT_OBSERVED;
  return startedPidField in value
    && typeof value[startedPidField] === "number"
    && terminationSignalField in value
    && (value[terminationSignalField] === null || value[terminationSignalField] === SIGTERM_NAME)
    && exitObservedField in value
    && typeof value[exitObservedField] === "boolean";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runTypeScriptValidation(
  cwd: string,
  operands: readonly string[] = [],
): Promise<Awaited<ReturnType<typeof execa>>> {
  return execa(process.execPath, [...validationTypeScriptAliasArgs(), ...operands], { cwd, reject: false });
}

function expectTypeScriptAbsent(result: Awaited<ReturnType<typeof execa>>): void {
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
  expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
  expect(result.stderr).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
  expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
}
