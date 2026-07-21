import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  runIsolatedEscapeWriteProbe,
  runIsolatedNetworkAttemptProbe,
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
