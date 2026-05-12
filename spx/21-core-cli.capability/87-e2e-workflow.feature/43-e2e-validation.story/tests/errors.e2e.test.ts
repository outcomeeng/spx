import { SPEC_STATUS_MESSAGE } from "@/commands/spec/status";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CLI_PATH, VERSION_FLAG } from "@testing/harnesses/constants";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("current spec-tree CLI error and empty-state scenarios", () => {
  it("reports an empty current spec-tree as a successful empty state", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const { exitCode, stdout } = await execa("node", [CLI_PATH, "spec", "status"], {
        cwd: productDir,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toBe(SPEC_STATUS_MESSAGE.EMPTY);
    });
  });

  it("rejects an invalid status format with an error", async () => {
    const { exitCode, stderr } = await execa(
      "node",
      [CLI_PATH, "spec", "status", "--format", "invalid"],
      { reject: false },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid format");
  });

  it("rejects an invalid command", async () => {
    const { exitCode, stderr } = await execa("node", [CLI_PATH, "notacommand"], {
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stderr.toLowerCase()).toMatch(/unknown command|error/i);
  });

  it("prints global help and version output", async () => {
    const help = await execa("node", [CLI_PATH, "--help"]);
    const version = await execa("node", [CLI_PATH, VERSION_FLAG]);

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("Usage:");
    expect(version.exitCode).toBe(0);
    expect(version.stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});
