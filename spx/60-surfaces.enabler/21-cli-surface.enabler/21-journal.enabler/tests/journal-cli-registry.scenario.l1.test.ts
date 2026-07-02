import { describe, expect, it } from "vitest";

import { JOURNAL_CLI_ERROR, JOURNAL_CLI_EXIT_CODE } from "@/commands/journal/cli";
import { JOURNAL_CLI, JOURNAL_CLI_HELP } from "@/interfaces/cli/journal";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";
import { arbitraryInvalidJournalLimit, arbitraryJournalRunLimit } from "@testing/generators/journal/type";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { withJournalHarness } from "@testing/harnesses/journal/harness";

interface JournalCliRun {
  readonly exitCodes: readonly number[];
  readonly stderr: string;
  readonly stdout: string;
}

function optionName(definition: string): string {
  return definition.split(" ")[0] ?? definition;
}

async function runJournalCli(args: readonly string[], productDir: string): Promise<JournalCliRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const journalDomain = CLI_DOMAINS.find((domain) => domain.name === JOURNAL_CLI.commandName);
  expect(journalDomain).toBeDefined();
  if (journalDomain === undefined) throw new Error("journal domain missing from the CLI registry");
  const program = createCliProgram({
    domains: [journalDomain],
    processCwd: () => productDir,
    setExitCode: (exitCode) => exitCodes.push(exitCode),
    writeStderr: (output) => stderr.push(output),
    writeStdout: (output) => stdout.push(output),
  });
  await program.parseAsync([JOURNAL_CLI.commandName, ...args], { from: SPX_COMMANDER_PARSE_SOURCE });
  return { exitCodes, stderr: stderr.join(""), stdout: stdout.join("") };
}

describe("journal CLI registry", () => {
  it("registers the journal command group with its verbs through the root CLI registry", () => {
    const journalDomain = CLI_DOMAINS.find((domain) => domain.name === JOURNAL_CLI.commandName);
    expect(journalDomain).toBeDefined();
    if (journalDomain === undefined) throw new Error("journal domain missing from the CLI registry");

    const program = createCliProgram({ domains: [journalDomain] });
    const journalCommand = program.commands.find((command) => command.name() === JOURNAL_CLI.commandName);

    expect(journalCommand).toBeDefined();
    expect(journalCommand?.commands.map((command) => command.name())).toEqual([
      JOURNAL_CLI.openCommandName,
      JOURNAL_CLI.appendCommandName,
      JOURNAL_CLI.readCommandName,
      JOURNAL_CLI.sealCommandName,
      JOURNAL_CLI.renderCommandName,
      JOURNAL_CLI.listCommandName,
      JOURNAL_CLI.readSetCommandName,
    ]);
  });

  it("wires read-set run and event limits through the registered command surface", async () => {
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const validLimit = sampleStateStoreTestValue(arbitraryJournalRunLimit(type.length));
    const invalidLimit = sampleStateStoreTestValue(arbitraryInvalidJournalLimit());
    const typeOption = optionName(JOURNAL_CLI.typeOption);
    const limitOption = optionName(JOURNAL_CLI.limitOption);
    const eventLimitOption = optionName(JOURNAL_CLI.eventLimitOption);

    await withJournalHarness(async (productDir) => {
      const valid = await runJournalCli(
        [
          JOURNAL_CLI.readSetCommandName,
          typeOption,
          type,
          limitOption,
          String(validLimit),
          eventLimitOption,
          String(validLimit),
        ],
        productDir,
      );
      const invalidRunLimit = await runJournalCli(
        [JOURNAL_CLI.readSetCommandName, typeOption, type, limitOption, invalidLimit],
        productDir,
      );
      const invalidEventLimit = await runJournalCli(
        [JOURNAL_CLI.readSetCommandName, typeOption, type, eventLimitOption, invalidLimit],
        productDir,
      );

      expect(valid.exitCodes).toEqual([JOURNAL_CLI_EXIT_CODE.OK]);
      expect(JSON.parse(valid.stdout) as unknown).toEqual([]);
      expect(invalidRunLimit).toEqual({
        exitCodes: [JOURNAL_CLI_EXIT_CODE.ERROR],
        stderr: `${JOURNAL_CLI_ERROR.INVALID_RUN_LIMIT}\n`,
        stdout: "",
      });
      expect(invalidEventLimit).toEqual({
        exitCodes: [JOURNAL_CLI_EXIT_CODE.ERROR],
        stderr: `${JOURNAL_CLI_ERROR.INVALID_READ_SET_EVENT_LIMIT}\n`,
        stdout: "",
      });
    });
  });

  it("documents default bounds in the registered command help", () => {
    const journalDomain = CLI_DOMAINS.find((domain) => domain.name === JOURNAL_CLI.commandName);
    expect(journalDomain).toBeDefined();
    if (journalDomain === undefined) throw new Error("journal domain missing from the CLI registry");

    const program = createCliProgram({ domains: [journalDomain] });
    const journalCommand = program.commands.find((command) => command.name() === JOURNAL_CLI.commandName);
    const listCommand = journalCommand?.commands.find((command) => command.name() === JOURNAL_CLI.listCommandName);
    const readSetCommand = journalCommand?.commands.find((command) =>
      command.name() === JOURNAL_CLI.readSetCommandName
    );
    const listLimitOption = listCommand?.options.find((option) => option.flags === JOURNAL_CLI.limitOption);
    const limitOption = readSetCommand?.options.find((option) => option.flags === JOURNAL_CLI.limitOption);
    const eventLimitOption = readSetCommand?.options.find((option) => option.flags === JOURNAL_CLI.eventLimitOption);

    expect(listLimitOption?.description).toBe(JOURNAL_CLI_HELP.LIST_RUN_LIMIT);
    expect(limitOption?.description).toBe(JOURNAL_CLI_HELP.READ_SET_RUN_LIMIT);
    expect(eventLimitOption?.description).toBe(JOURNAL_CLI_HELP.READ_SET_EVENT_LIMIT);
  });
});
