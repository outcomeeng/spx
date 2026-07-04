import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  type VerifyAppendCliOptions,
  type VerifyFinishCliOptions,
  type VerifyInputCliOptions,
  type VerifyRenderCliOptions,
  type VerifyStartCliOptions,
  type VerifyStatusCliOptions,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import type { Domain } from "@/domains/types";
import { VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";
import {
  registerVerifyCommands,
  VERIFICATION_RUN_CLI_SURFACE,
  VERIFY_CLI,
  type VerifyCliHandlers,
} from "@/interfaces/cli/verify";
import { arbitrarySourceFilePath, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createVerifyRunContextScenario } from "@testing/harnesses/verify/harness";

function commandTokens(command: Command): readonly string[] {
  return [command.name(), ...command.aliases()];
}

function collectCommandTokens(command: Command): readonly string[] {
  return [
    ...commandTokens(command),
    ...command.commands.flatMap((childCommand) => collectCommandTokens(childCommand)),
  ];
}

function requiredOptionFlags(command: Command | undefined): readonly string[] {
  return command?.options.filter((option) => option.required).map((option) => option.flags) ?? [];
}

interface VerifyCliRecording {
  readonly appendFindingOptions: readonly VerifyAppendCliOptions[];
  readonly appendScopeOptions: readonly VerifyAppendCliOptions[];
  readonly finishOptions: readonly VerifyFinishCliOptions[];
  readonly inputOptions: readonly VerifyInputCliOptions[];
  readonly renderOptions: readonly VerifyRenderCliOptions[];
  readonly startOptions: readonly VerifyStartCliOptions[];
  readonly statusOptions: readonly VerifyStatusCliOptions[];
  readonly handlers: VerifyCliHandlers;
}

function okCliResult(): CliCommandResult {
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, output: JSON.stringify({}) };
}

function createRecordingVerifyHandlers(): VerifyCliRecording {
  const appendFindingOptions: VerifyAppendCliOptions[] = [];
  const appendScopeOptions: VerifyAppendCliOptions[] = [];
  const finishOptions: VerifyFinishCliOptions[] = [];
  const inputOptions: VerifyInputCliOptions[] = [];
  const renderOptions: VerifyRenderCliOptions[] = [];
  const startOptions: VerifyStartCliOptions[] = [];
  const statusOptions: VerifyStatusCliOptions[] = [];

  return {
    appendFindingOptions,
    appendScopeOptions,
    finishOptions,
    inputOptions,
    renderOptions,
    startOptions,
    statusOptions,
    handlers: {
      appendFinding: (options) => {
        appendFindingOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      appendScope: (options) => {
        appendScopeOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      finish: (options) => {
        finishOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      input: (options) => {
        inputOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      render: (options) => {
        renderOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      start: (options) => {
        startOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      status: (options) => {
        statusOptions.push(options);
        return Promise.resolve(okCliResult());
      },
    },
  };
}

function createRecordingVerifyProgram(recording: VerifyCliRecording, productDir: string): Command {
  const recordingDomain: Domain = {
    name: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    description: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    register: (program, invocation) => {
      registerVerifyCommands(program, invocation, recording.handlers);
    },
  };
  return createCliProgram({
    domains: [recordingDomain],
    processCwd: () => productDir,
    setExitCode: () => undefined,
    writeStderr: () => undefined,
    writeStdout: () => undefined,
  });
}

function verificationRunArgs(
  commandPath: readonly string[],
  options: readonly string[],
): readonly string[] {
  return [
    VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    VERIFICATION_RUN_CLI_SURFACE.runCommandName,
    ...commandPath,
    ...options,
  ];
}

function requiredFlag(optionExpression: string): string {
  const [flag] = optionExpression.split(" ");
  if (flag === undefined) throw new Error("Commander option expression has no flag token");
  return flag;
}

function requiredOptionDescription(command: Command | undefined, optionExpression: string): string | undefined {
  return command?.options.find((option) => option.flags === optionExpression)?.description;
}

describe("verification command family compliance", () => {
  it("exposes typed verification runs under the verification run noun group", () => {
    const program = createCliProgram();
    const verificationCommand = program.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    );

    expect(verificationCommand).toBeDefined();
    expect(verificationCommand?.commands.map((command) => command.name())).toContain(
      VERIFICATION_RUN_CLI_SURFACE.runCommandName,
    );
  });

  it("keeps scope and finding evidence additions noun-local", () => {
    const verifyDomain = CLI_DOMAINS.find((domain) => domain.name === VERIFICATION_RUN_CLI_SURFACE.rootCommandName);
    expect(verifyDomain).toBeDefined();
    if (verifyDomain === undefined) throw new Error("verification-run domain missing from the CLI registry");

    const program = createCliProgram({ domains: [verifyDomain] });
    const verificationCommand = program.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    );
    const runCommand = verificationCommand?.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.runCommandName,
    );
    const scopeCommand = runCommand?.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.scopeResourceCommandName,
    );
    const findingCommand = runCommand?.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.findingResourceCommandName,
    );
    expect(runCommand).toBeDefined();
    expect(scopeCommand).toBeDefined();
    expect(findingCommand).toBeDefined();

    const scopeAddCommand = scopeCommand?.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.addCommandName,
    );
    const findingAddCommand = findingCommand?.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.addCommandName,
    );
    expect(scopeAddCommand).toBeDefined();
    expect(findingAddCommand).toBeDefined();
    expect(requiredOptionFlags(scopeAddCommand)).toEqual(
      expect.arrayContaining([
        VERIFY_CLI.payloadOption,
        VERIFY_CLI.idempotencyKeyOption,
      ]),
    );
    expect(requiredOptionFlags(findingAddCommand)).toEqual(
      expect.arrayContaining([
        VERIFY_CLI.payloadOption,
        VERIFY_CLI.idempotencyKeyOption,
      ]),
    );
    expect(requiredOptionDescription(scopeAddCommand, VERIFY_CLI.payloadOption)).toBe(
      VERIFY_CLI.payloadOptionDescription,
    );
    expect(requiredOptionDescription(findingAddCommand, VERIFY_CLI.payloadOption)).toBe(
      VERIFY_CLI.payloadOptionDescription,
    );
    expect(requiredOptionDescription(scopeAddCommand, VERIFY_CLI.idempotencyKeyOption)).toBe(
      VERIFY_CLI.idempotencyKeyOptionDescription,
    );
    expect(requiredOptionDescription(findingAddCommand, VERIFY_CLI.idempotencyKeyOption)).toBe(
      VERIFY_CLI.idempotencyKeyOptionDescription,
    );
    for (const forbiddenHelpTerm of VERIFICATION_RUN_CLI_SURFACE.forbiddenRunHelpTerms) {
      expect(requiredOptionDescription(scopeAddCommand, VERIFY_CLI.payloadOption)).not.toContain(
        forbiddenHelpTerm,
      );
      expect(requiredOptionDescription(findingAddCommand, VERIFY_CLI.payloadOption)).not.toContain(
        forbiddenHelpTerm,
      );
    }
  });

  it("keeps journal mechanics out of the public verification-run command paths", () => {
    const program = createCliProgram();
    const commandNames = program.commands.flatMap((command) => commandTokens(command));
    const verificationCommand = program.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    );
    const runCommand = verificationCommand?.commands.find(
      (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.runCommandName,
    );
    const runCommandNames = runCommand === undefined ? [] : collectCommandTokens(runCommand);

    expect(commandNames).not.toContain(VERIFICATION_RUN_CLI_SURFACE.forbiddenRootCommandName);
    for (const forbiddenRunCommandName of VERIFICATION_RUN_CLI_SURFACE.forbiddenRunCommandNames) {
      expect(runCommandNames).not.toContain(forbiddenRunCommandName);
    }
  });

  it("passes parsed verification-run selector options to lifecycle handlers", async () => {
    const scenario = createVerifyRunContextScenario();
    const recording = createRecordingVerifyHandlers();
    const program = createRecordingVerifyProgram(recording, scenario.productDir);
    const inputSource = sampleLiteralTestValue(arbitrarySourceFilePath());
    const scopePayloadSource = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
    const findingPayloadSource = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const runToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
    const idempotencyKeys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
    const sharedExistingRunOptions = [
      requiredFlag(VERIFY_CLI.verificationTypeOption),
      scenario.verificationType,
      requiredFlag(VERIFY_CLI.scopeTypeOption),
      VERIFY_SCOPE_TYPE.CHANGESET,
      requiredFlag(VERIFY_CLI.scopeOption),
      scenario.scope,
      requiredFlag(VERIFY_CLI.runOption),
      runToken,
    ];

    await program.parseAsync(
      verificationRunArgs([VERIFY_CLI.startCommandName], [
        requiredFlag(VERIFY_CLI.verificationTypeOption),
        scenario.verificationType,
        requiredFlag(VERIFY_CLI.scopeTypeOption),
        VERIFY_SCOPE_TYPE.CHANGESET,
        requiredFlag(VERIFY_CLI.scopeOption),
        scenario.scope,
        requiredFlag(VERIFY_CLI.inputOption),
        inputSource,
      ]),
      { from: SPX_COMMANDER_PARSE_SOURCE },
    );
    await program.parseAsync(
      verificationRunArgs(
        [VERIFICATION_RUN_CLI_SURFACE.scopeResourceCommandName, VERIFICATION_RUN_CLI_SURFACE.addCommandName],
        [
          ...sharedExistingRunOptions,
          requiredFlag(VERIFY_CLI.payloadOption),
          scopePayloadSource,
          requiredFlag(VERIFY_CLI.idempotencyKeyOption),
          idempotencyKeys.first,
        ],
      ),
      { from: SPX_COMMANDER_PARSE_SOURCE },
    );
    await program.parseAsync(
      verificationRunArgs(
        [VERIFICATION_RUN_CLI_SURFACE.findingResourceCommandName, VERIFICATION_RUN_CLI_SURFACE.addCommandName],
        [
          ...sharedExistingRunOptions,
          requiredFlag(VERIFY_CLI.payloadOption),
          findingPayloadSource,
          requiredFlag(VERIFY_CLI.idempotencyKeyOption),
          idempotencyKeys.second,
        ],
      ),
      { from: SPX_COMMANDER_PARSE_SOURCE },
    );

    expect(recording.startOptions).toEqual([
      {
        verificationType: scenario.verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: scenario.scope,
        input: inputSource,
      },
    ]);
    expect(recording.appendScopeOptions).toEqual([
      {
        verificationType: scenario.verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: scenario.scope,
        run: runToken,
        payload: scopePayloadSource,
        idempotencyKey: idempotencyKeys.first,
      },
    ]);
    expect(recording.appendFindingOptions).toEqual([
      {
        verificationType: scenario.verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scope: scenario.scope,
        run: runToken,
        payload: findingPayloadSource,
        idempotencyKey: idempotencyKeys.second,
      },
    ]);
  });
});
