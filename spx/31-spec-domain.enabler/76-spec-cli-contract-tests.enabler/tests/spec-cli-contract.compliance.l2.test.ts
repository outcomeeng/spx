import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PACKAGE_MANIFEST } from "@/commands/release/package-manifest";
import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { CONFIG_FILENAMES, DEFAULT_CONFIG_FILENAME } from "@/config";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { NODE_STATUS_FILENAME } from "@/lib/node-status";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { ERROR_CODE_NOT_FOUND } from "@/lib/state-store";
import { PYTHON_MARKER, TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { specCliApplyProtectionFixture } from "@testing/generators/spec-tree/spec-cli";
import { RETIRED_SPEC_APPLY_FIXTURE, specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  installSpecCliProductConfigFixture,
  runIsolatedEscapeWriteProbe,
  runIsolatedNetworkAttemptProbe,
  runSpecCli,
  runSpecCliWithIsolation,
} from "@testing/harnesses/spec/context";

describe("spx spec process isolation", () => {
  it("invokes the packaged executable with zero outbound network attempts while the guard records a forced attempt", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const execution = await runSpecCliWithIsolation(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.STATUS_COMMAND,
        SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
        OUTPUT_FORMAT.JSON,
      );
      expect(execution.result.exitCode).toBe(0);
      expect(execution.networkAttempts).toEqual([]);
      expect(() => JSON.parse(execution.result.stdout)).not.toThrow();

      // The violating fixture proves the guard observes what the conforming
      // run claims is absent: a forced outbound request under the identical
      // isolation records an attempt and fails the subprocess.
      const probe = await runIsolatedNetworkAttemptProbe(env.productDir);
      expect(probe.result.exitCode).not.toBe(0);
      expect(probe.networkAttempts.length).toBeGreaterThan(0);
    });
  });

  it("confines mutable process writes to the temp product directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      // Conforming case: the CLI operates entirely inside the granted
      // product directory and exits cleanly.
      const execution = await runSpecCliWithIsolation(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.STATUS_COMMAND,
        SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
        OUTPUT_FORMAT.JSON,
      );
      expect(execution.result.exitCode, execution.result.stderr).toBe(0);

      // Violating fixture: an identical isolated subprocess attempting one
      // write outside the product directory is denied and leaves no file.
      const probe = await runIsolatedEscapeWriteProbe(env.productDir);
      expect(probe.result.exitCode).not.toBe(0);
      expect(probe.escapeFileExists).toBe(false);
    });
  });
});

describe("spx spec product configuration protection", () => {
  it("leaves every product configuration file untouched while status --update writes node status and apply routing is attempted", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      await installSpecCliProductConfigFixture(env.productDir, [PACKAGE_MANIFEST, PYTHON_MARKER, TYPESCRIPT_MARKER]);
      await env.writeRaw(
        RETIRED_SPEC_APPLY_FIXTURE.excludeFile,
        specCliApplyProtectionFixture(env.fixture).excludeContent,
      );
      const rootStatusPath = join(
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root),
        NODE_STATUS_FILENAME,
      );
      const presentConfigFiles = [DEFAULT_CONFIG_FILENAME, PACKAGE_MANIFEST, PYTHON_MARKER, TYPESCRIPT_MARKER];
      const absentConfigFiles = Object.values(CONFIG_FILENAMES).filter((name) => name !== DEFAULT_CONFIG_FILENAME);
      const before = await Promise.all(presentConfigFiles.map((path) => env.readFile(path)));
      await expect(env.readFile(rootStatusPath)).rejects.toMatchObject({ code: ERROR_CODE_NOT_FOUND });

      // Conforming write: the spec domain's status writer runs and records node
      // status, proving a write path executed under this observation.
      const update = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.STATUS_COMMAND,
        SPEC_DOMAIN_CLI.UPDATE_OPTION,
      );
      expect(update.exitCode, update.stderr).toBe(0);
      await expect(env.readFile(rootStatusPath)).resolves.toBeDefined();

      // Violating request: the retired config-writing apply routing over an
      // EXCLUDE file and a pytest configuration it once rewrote.
      const apply = await runSpecCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, RETIRED_SPEC_APPLY_FIXTURE.command);
      expect(apply.exitCode).not.toBe(0);

      await expect(Promise.all(presentConfigFiles.map((path) => env.readFile(path)))).resolves.toEqual(before);
      for (const absent of absentConfigFiles) {
        await expect(env.readFile(absent)).rejects.toMatchObject({ code: ERROR_CODE_NOT_FOUND });
      }
    });
  });
});
