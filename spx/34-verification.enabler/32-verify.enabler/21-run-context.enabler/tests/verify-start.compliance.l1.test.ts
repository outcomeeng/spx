import { basename, join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyInputCommand, verifyStartCommand } from "@/commands/verify/cli";
import { VERIFY_INPUT_RECORD, verifyRunsDir } from "@/domains/verify/verify";
import type { ExecResult, GitDependencies } from "@/git/root";
import { GIT_NAME_STATUS_FLAG } from "@/lib/git/name-status";
import {
  ERROR_CODE_NOT_FOUND,
  resolveBranchIdentity,
  slugBranchIdentity,
  STATE_STORE_SCOPE_PATH,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createVerifyRunContextScenario,
  parseInputReport,
  parseStartReport,
  verifyDeps,
  verifyGitDeps,
  verifyInputOptions,
  verifyStartOptions,
} from "@testing/harnesses/verify/harness";

function failChangedScopeGitDeps(base: GitDependencies): GitDependencies {
  return {
    execa: (command, args, options) => {
      if (args.includes(GIT_NAME_STATUS_FLAG)) {
        const failure: ExecResult = {
          exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
          stdout: "",
          stderr: VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED,
        };
        return Promise.resolve(failure);
      }
      return base.execa(command, args, options);
    },
  };
}

function createInputPersistFailureFileSystem(): StateStoreFileSystem {
  const fs = createInMemoryStateStoreFileSystem();
  return {
    appendFile: (path, data) => fs.appendFile(path, data),
    lstat: (path) => fs.lstat(path),
    mkdir: (path, options) => fs.mkdir(path, options),
    readFile: (path, encoding) => fs.readFile(path, encoding),
    readdir: (path, options) => fs.readdir(path, options),
    rename: async (from, to) => {
      const targetName = basename(to);
      if (targetName.startsWith(VERIFY_INPUT_RECORD.PREFIX) && targetName.endsWith(VERIFY_INPUT_RECORD.SUFFIX)) {
        throw new Error("verify harness: input record rename rejected");
      }
      await fs.rename(from, to);
    },
    rm: (path, options) => fs.rm(path, options),
    writeFile: (path, data, options) => fs.writeFile(path, data, options),
  };
}

function scenarioRunsDir(scenario: ReturnType<typeof createVerifyRunContextScenario>): string {
  const branchSlug = slugBranchIdentity(resolveBranchIdentity({
    branchName: scenario.branchIdentity,
    headSha: scenario.headSha,
  }));
  const runs = verifyRunsDir({
    productDir: scenario.productDir,
    branchSlug,
    type: scenario.verificationType,
  });
  if (!runs.ok) throw new Error(`verify harness: runs directory failed: ${runs.error}`);
  return runs.value;
}

describe("verify start compliance", () => {
  it("requires a non-blank --input source before starting a run", async () => {
    const scenario = createVerifyRunContextScenario();

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.blankInputSource(), async (blankInput) => {
        const fs = createInMemoryStateStoreFileSystem();
        const started = await verifyStartCommand(
          { ...verifyStartOptions(scenario), input: blankInput },
          verifyDeps(scenario, fs),
        );
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toBe(VERIFY_CLI_ERROR.INPUT_REQUIRED);
      }),
    );
  });

  it("rejects an unsupported verification type before opening a run", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());

    const started = await verifyStartCommand(
      { ...verifyStartOptions(scenario), verificationType: unsupportedType },
      verifyDeps(scenario, fs),
    );

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(started.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  });

  it("rejects a changed-scope failure before opening an addressable run", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);
    const failingDeps = { ...deps, git: failChangedScopeGitDeps(verifyGitDeps(scenario)) };

    const started = await verifyStartCommand(verifyStartOptions(scenario), failingDeps);

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(started.output).toContain(VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED);
    await expect(fs.lstat(join(scenario.productDir, STATE_STORE_SCOPE_PATH.SPX_DIR))).rejects.toThrow(
      ERROR_CODE_NOT_FOUND,
    );

    const replayed = await verifyInputCommand(
      verifyInputOptions(scenario, sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken())),
      deps,
    );
    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(replayed.output).toContain(VERIFY_CLI_ERROR.RUN_NOT_FOUND);
  });

  it("reports input-read failures before opening an addressable run", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = {
      ...verifyDeps(scenario, fs),
      readInputSource: async () => {
        throw new Error(scenario.inputContent);
      },
    };

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(started.output).toContain(VERIFY_CLI_ERROR.INPUT_READ_FAILED);
    await expect(fs.lstat(join(scenario.productDir, STATE_STORE_SCOPE_PATH.SPX_DIR))).rejects.toThrow(
      ERROR_CODE_NOT_FOUND,
    );
  });

  it("removes an opened journal run when recorded-input persistence fails", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInputPersistFailureFileSystem();

    const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(started.output).toContain(VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED);
    const runEntries = await fs.readdir(scenarioRunsDir(scenario), { withFileTypes: true });
    expect(runEntries).toHaveLength(0);
  });

  it("records the verification input at start so the input verb replays it", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);

    const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseInputReport(replayed.output).content).toBe(scenario.inputContent);
  });

  it("reports every run-locator selector a caller persists to replay the run identity", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();

    const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const { locator } = parseStartReport(started.output);
    const selectors = [
      locator.runToken,
      locator.verificationType,
      locator.scopeType,
      locator.scopeIdentity,
      locator.backendIdentity,
      locator.storageNamespace,
      locator.runTarget,
    ];
    for (const selector of selectors) {
      expect(selector.length).toBeGreaterThan(0);
    }
  });
});
