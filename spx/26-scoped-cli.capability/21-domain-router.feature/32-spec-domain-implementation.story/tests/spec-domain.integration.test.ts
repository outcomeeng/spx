import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { SPEC_STATUS_MESSAGE } from "@/commands/spec/status";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CLI_PATH } from "@testing/harnesses/constants";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("Spec Domain Integration", () => {
  it("routes spec status through the current spec-tree command", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status"], {
        cwd: productDir,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toBe(SPEC_STATUS_MESSAGE.EMPTY);
    });
  });

  it("routes spec next through the current spec-tree command", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "next"], {
        cwd: productDir,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toBe(SPEC_NEXT_MESSAGE.EMPTY);
    });
  });

  it("shows current spec-tree wording in spec help", async () => {
    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "next", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Find next spec-tree node");
  });

  it("rejects invalid status formats", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const { stderr, exitCode } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--format", "invalid"],
        {
          cwd: productDir,
          reject: false,
        },
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid format");
    });
  });
});
