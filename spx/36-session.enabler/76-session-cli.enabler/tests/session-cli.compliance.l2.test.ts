import { execa } from "execa";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_STATUSES } from "@/domains/session/types";
import { createSessionHarness, type SessionHarness } from "@testing/harnesses/session/harness";

const [TODO, , ARCHIVE] = SESSION_STATUSES;
const CLI_ENTRY = join(process.cwd(), "bin/spx.js");

async function runSpx(
  args: readonly string[],
  input?: string,
  cwd: string = process.cwd(),
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa("node", [CLI_ENTRY, ...args], {
    cwd,
    input,
    reject: false,
  });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

async function createGitCwd(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "spx-session-cli-git-"));
  await execa("git", ["init", "-b", "main"], { cwd });
  await execa("git", ["config", "user.email", "test@example.com"], { cwd });
  await execa("git", ["config", "user.name", "Test User"], { cwd });
  await execa("git", ["commit", "--allow-empty", "-m", "initial"], { cwd });
  return cwd;
}

describe("session CLI compliance", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("ALWAYS: variadic commands process IDs after a failed ID", async () => {
    const validId = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, validId);

    const result = await runSpx([
      "session",
      "delete",
      "missing-id",
      validId,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing-id");
    expect(result.stderr).toContain(validId);
    expect(existsSync(join(harness.statusDir(TODO), `${validId}.md`))).toBe(false);
  });

  it("ALWAYS: partial failure exits non-zero while preserving successful work", async () => {
    const validId = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, validId, { result: "Ready to archive" });

    const result = await runSpx([
      "session",
      "archive",
      validId,
      "missing-id",
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${validId}.md`))).toBe(true);
  });

  it("ALWAYS: frontmatter validation diagnostics include error names", async () => {
    const gitCwd = await createGitCwd();
    let omitsGoal: { stdout: string; stderr: string; exitCode: number };
    let legacyYaml: { stdout: string; stderr: string; exitCode: number };
    try {
      // JSON header that omits goal — semantic-content error per
      // 76-session-cli.enabler/session-cli.md.
      omitsGoal = await runSpx(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"priority":"high","next_step":"Run validation","specs":[],"files":[]}\n# Session`,
        gitCwd,
      );

      // Stdin opening with the YAML-frontmatter delimiter — wire-format error.
      legacyYaml = await runSpx(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        "---\npriority: high\ngoal: Legacy shape\nnext_step: Should reject\n---\n# Body",
        gitCwd,
      );
    } finally {
      await rm(gitCwd, { recursive: true, force: true });
    }

    expect(omitsGoal.exitCode).toBe(1);
    expect(omitsGoal.stderr).toContain("SessionInvalidGoalError");

    expect(legacyYaml.exitCode).toBe(1);
    expect(legacyYaml.stderr).toContain("SessionLegacyFrontmatterInputError");

    const sessionId = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, sessionId);
    const archive = await runSpx([
      "session",
      "archive",
      sessionId,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(archive.exitCode).toBe(1);
    expect(archive.stderr).toContain("SessionInvalidResultError");
    expect(archive.stderr).toContain(sessionId);
  });
});
