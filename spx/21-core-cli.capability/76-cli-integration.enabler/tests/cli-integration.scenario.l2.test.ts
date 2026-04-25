import { CLI_PATH, FIXTURES_ROOT } from "@test/harness/constants";
import { execa } from "execa";
import path from "path";
import { describe, expect, it } from "vitest";

// ─── spx spec status ──────────────────────────────────────────────────────────

describe("spx spec status", () => {
  it("GIVEN project with work items WHEN running status THEN outputs tree and exits 0", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status"], { cwd });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("capability-");
    expect(stdout).toContain("feature-");
    expect(stdout).toContain("story-");
  });

  it("GIVEN project with no work items WHEN running status THEN stdout contains 'No work items found'", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/empty");

    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status"], { cwd });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("No work items found");
  });

  it("GIVEN project with no specs directory WHEN running status THEN exits 1 and stderr contains 'Error:'", async () => {
    const cwd = FIXTURES_ROOT;

    const result = await execa("node", [CLI_PATH, "spec", "status"], { cwd, reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error:");
  });

  it("GIVEN --json flag WHEN running status THEN stdout is valid JSON with capabilities", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
      cwd,
    });

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(JSON.parse(stdout).capabilities).toBeDefined();
  });

  it("GIVEN --json flag WHEN running status THEN output includes config values", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
      cwd,
    });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.config).toBeDefined();
    expect(parsed.config.specs.root).toBe("specs");
    expect(parsed.config.specs.work.dir).toBe("work");
    expect(parsed.config.specs.work.statusDirs.doing).toBe("doing");
    expect(parsed.config.sessions.dir).toBe(".spx/sessions");
  });

  it("GIVEN --format json WHEN running status THEN exits 0 and stdout is valid JSON", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const { stdout, exitCode } = await execa(
      "node",
      [CLI_PATH, "spec", "status", "--format", "json"],
      { cwd },
    );

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  it("GIVEN --format markdown WHEN running status THEN exits 0 and stdout contains markdown headings", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const { stdout, exitCode } = await execa(
      "node",
      [CLI_PATH, "spec", "status", "--format", "markdown"],
      { cwd },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^#/m);
  });

  it("GIVEN --format table WHEN running status THEN exits 0 and stdout contains table rows", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const { stdout, exitCode } = await execa(
      "node",
      [CLI_PATH, "spec", "status", "--format", "table"],
      { cwd },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\|.*\|/);
  });

  it("GIVEN --format text WHEN running status THEN exits 0 and stdout contains tree items", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const { stdout, exitCode } = await execa(
      "node",
      [CLI_PATH, "spec", "status", "--format", "text"],
      { cwd },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("capability-");
    expect(stdout).toContain("feature-");
  });

  it("GIVEN --format invalid WHEN running status THEN exits 1 and stderr names the invalid value", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const result = await execa(
      "node",
      [CLI_PATH, "spec", "status", "--format", "invalid"],
      { cwd, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid format \"invalid\"");
  });
});

// ─── spx spec next ────────────────────────────────────────────────────────────

describe("spx spec next", () => {
  it("GIVEN project with IN_PROGRESS item WHEN running next THEN stdout contains 'Next work item:'", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/mixed");

    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "next"], { cwd });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Next work item:");
  });

  it("GIVEN project where all items are DONE WHEN running next THEN stdout contains completion message", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/all-done");

    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "next"], { cwd });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("All work items are complete");
  });

  it("GIVEN project with no work items WHEN running next THEN stdout contains 'No work items found'", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/empty");

    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "next"], { cwd });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("No work items found");
  });

  it("GIVEN project with no specs directory WHEN running next THEN exits 1 and stderr contains 'Error:'", async () => {
    const cwd = FIXTURES_ROOT;

    const result = await execa("node", [CLI_PATH, "spec", "next"], { cwd, reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error:");
  });
});

// ─── error handling and help ──────────────────────────────────────────────────

describe("spx error handling and help", () => {
  it("GIVEN unknown subcommand WHEN running spx THEN exits 1 and stderr matches /unknown command|error/i", async () => {
    const result = await execa("node", [CLI_PATH, "invalid"], { reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/unknown command|error/i);
  });

  it("GIVEN no arguments WHEN running spx THEN output contains 'Usage:' or 'Commands:'", async () => {
    const result = await execa("node", [CLI_PATH], { reject: false });

    const output = result.stdout + result.stderr;
    expect(output).toMatch(/Usage:|Commands:/);
  });

  it("GIVEN --help flag WHEN running spx THEN exits 0 and stdout contains 'spec' and 'session'", async () => {
    const { stdout, exitCode } = await execa("node", [CLI_PATH, "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Usage:|Commands:/);
    expect(stdout).toContain("spec");
    expect(stdout).toContain("session");
  });

  it("GIVEN spec status --help WHEN running THEN exits 0 and stdout contains --json and --format", async () => {
    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--json");
    expect(stdout).toContain("--format");
  });

  it("GIVEN missing specs dir WHEN running status THEN stderr begins with 'Error:'", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/no-specs");

    const result = await execa("node", [CLI_PATH, "spec", "status"], { cwd, reject: false });

    expect(result.stderr).toMatch(/^Error:/);
  });

  it("GIVEN --format xml WHEN running status THEN stderr names the invalid format with valid options", async () => {
    const cwd = path.join(FIXTURES_ROOT, "repos/simple");

    const result = await execa(
      "node",
      [CLI_PATH, "spec", "status", "--format", "xml"],
      { cwd, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Invalid format \"xml\"");
    expect(result.stderr).toContain("text, json, markdown, table");
  });
});
