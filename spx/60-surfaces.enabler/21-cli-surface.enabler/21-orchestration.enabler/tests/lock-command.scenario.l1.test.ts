/**
 * Reachability of `spx orchestration lock -- <command>`: the command parses its arguments, binds
 * the host command lock's public surface over an in-memory host, runs one child, and reports the
 * terminal result on standard error. No process, kernel lock, signal, or host load is involved.
 */

import { describe, expect, it } from "vitest";

import { createOrchestrationDomain, ORCHESTRATION_CLI } from "@/interfaces/cli/orchestration";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { RESULT_SCHEMA, RESULT_STATUS } from "@/lib/host-command-lock";
import {
  arbitraryCommand,
  arbitraryCpuCount,
  arbitraryDistinctLabels,
  CLEAN_EXIT_CODE,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost } from "@testing/harnesses/host-command-lock/host-command-lock";

const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
const [runId] = sampleGeneratedValue(arbitraryDistinctLabels(1));
const command = sampleGeneratedValue(arbitraryCommand());

describe("spx orchestration lock -- <command>", () => {
  it("runs exactly one child under the host command lock and writes the terminal result to standard error", async () => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });
    const stderr: string[] = [];
    const exitCodes: number[] = [];
    const program = createCliProgram({
      domains: [createOrchestrationDomain(host.deps({ childExitCode: CLEAN_EXIT_CODE }))],
      setExitCode: (exitCode) => exitCodes.push(exitCode),
      writeStderr: (output) => stderr.push(output),
      writeStdout: () => undefined,
    });

    await program.parseAsync(
      [
        ORCHESTRATION_CLI.commandName,
        ORCHESTRATION_CLI.lockCommandName,
        ORCHESTRATION_CLI.runIdFlag,
        runId,
        ORCHESTRATION_CLI.argumentSeparator,
        ...command,
      ],
      { from: SPX_COMMANDER_PARSE_SOURCE },
    );

    expect(host.spawns).toHaveLength(1);
    expect([host.spawns[0].command, ...host.spawns[0].args]).toEqual(command);
    expect(exitCodes).toEqual([CLEAN_EXIT_CODE]);
    const resultLines = stderr
      .join("")
      .split("\n")
      .filter((line) => line.trim().startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(resultLines).toEqual([
      {
        schema: RESULT_SCHEMA,
        runId,
        started: true,
        status: RESULT_STATUS.COMPLETED,
        childExitCode: CLEAN_EXIT_CODE,
      },
    ]);
  });
});
