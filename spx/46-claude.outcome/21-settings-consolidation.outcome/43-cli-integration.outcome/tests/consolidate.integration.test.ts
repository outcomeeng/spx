/**
 * Integration tests for CLI consolidate command
 *
 * Test Level: 2 (Integration)
 * Why Level 2:
 * - Testing CLI command routing through Commander.js (project-specific)
 * - Testing real file system operations with actual CLI execution
 * - Testing full command pipeline from CLI args to file output
 *
 * What we verify:
 * - Preview mode (default) shows instructions without writing
 * - --write mode creates backup and modifies global settings
 * - --output-file writes to specified location
 * - Mutual exclusion of --write and --output-file
 * - Help text includes all command options
 * - Command correctly handles all path options (--root, --global-settings)
 */

import { execa } from "execa";
import { access, mkdir, mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, describe, expect, it } from "vitest";

const CLI_PATH = join(process.cwd(), "bin/spx.js");

describe("spx claude settings consolidate command", () => {
  let tempDir: string;
  let globalSettings: string;

  beforeEach(async () => {
    // Create isolated temp directory for each test
    tempDir = await mkdtemp(join(tmpdir(), "spx-cli-test-"));
    globalSettings = join(tempDir, ".claude", "settings.json");

    // Create empty global settings to start fresh
    await mkdir(join(tempDir, ".claude"), { recursive: true });
    await writeFile(
      globalSettings,
      JSON.stringify({
        permissions: {
          allow: [],
          deny: [],
          ask: [],
        },
      }),
    );

    // Create test project structure with local settings
    const project1 = join(tempDir, "project1");
    await mkdir(join(project1, ".claude"), { recursive: true });
    await writeFile(
      join(project1, ".claude", "settings.local.json"),
      JSON.stringify({
        permissions: {
          allow: ["Bash(git:*)", "Read(//tmp/**)"],
          deny: [],
          ask: [],
        },
      }),
    );

    const project2 = join(tempDir, "project2");
    await mkdir(join(project2, ".claude"), { recursive: true });
    await writeFile(
      join(project2, ".claude", "settings.local.json"),
      JSON.stringify({
        permissions: {
          allow: ["Bash(npm:*)"],
          deny: [],
          ask: [],
        },
      }),
    );
  });

  describe("Preview mode (default behavior)", () => {
    it("GIVEN projects with local settings WHEN running without flags THEN shows preview with instructions", async () => {
      // When: Run consolidate without any write flags
      const { stdout, exitCode } = await execa(
        "node",
        [
          CLI_PATH,
          "claude",
          "settings",
          "consolidate",
          "--root",
          tempDir,
          "--global-settings",
          globalSettings,
        ],
        {
          cwd: process.cwd(),
        },
      );

      // Then: Success and shows all permissions
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Found 2 settings files");
      expect(stdout).toContain("Bash(git:*)");
      expect(stdout).toContain("Bash(npm:*)");
      expect(stdout).toContain("Read(//tmp/**)");

      // And: Shows preview mode instructions
      expect(stdout).toContain("Preview mode");
      expect(stdout).toContain("--write");
      expect(stdout).toContain("--output-file");

      // And: Does not modify global settings
      const settings = JSON.parse(await readFile(globalSettings, "utf-8"));
      expect(settings.permissions.allow).toHaveLength(0);
    });

    it("GIVEN empty directory WHEN running consolidate THEN shows no settings found", async () => {
      // Given: Empty directory with no projects
      const emptyDir = await mkdtemp(join(tmpdir(), "spx-cli-empty-"));

      // When: Run consolidate
      const { stdout, exitCode } = await execa(
        "node",
        [CLI_PATH, "claude", "settings", "consolidate", "--root", emptyDir],
        {
          cwd: process.cwd(),
        },
      );

      // Then: Success but no files found
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No settings files found");
    });
  });

  describe("Write mode (--write)", () => {
    it("GIVEN projects with local settings WHEN running with --write THEN modifies global settings", async () => {
      // When: Run consolidate with --write
      const { stdout, exitCode } = await execa(
        "node",
        [
          CLI_PATH,
          "claude",
          "settings",
          "consolidate",
          "--write",
          "--root",
          tempDir,
          "--global-settings",
          globalSettings,
        ],
        {
          cwd: process.cwd(),
        },
      );

      // Then: Success and shows confirmation
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Found 2 settings files");
      expect(stdout).toContain("Permissions added: 3");
      expect(stdout).toContain("Global settings updated");

      // And: Shows backup was created
      expect(stdout).toContain("Backup created:");
      expect(stdout).toContain(".backup.");

      // And: Global settings file is modified
      const settings = JSON.parse(await readFile(globalSettings, "utf-8"));
      expect(settings.permissions.allow).toContain("Bash(git:*)");
      expect(settings.permissions.allow).toContain("Bash(npm:*)");
      expect(settings.permissions.allow).toContain("Read(//tmp/**)");
      expect(settings.permissions.allow).toHaveLength(3);

      // And: Backup file exists
      const backupPath = stdout.match(/Backup created: (.+)/)?.[1];
      expect(backupPath).toBeDefined();
      await expect(access(backupPath!)).resolves.not.toThrow();
    });

    it("GIVEN subsumable permissions WHEN running with --write THEN removes subsumed", async () => {
      // Given: Project with narrow and broad permissions
      const project = join(tempDir, "project-subsume");
      await mkdir(join(project, ".claude"), { recursive: true });
      await writeFile(
        join(project, ".claude", "settings.local.json"),
        JSON.stringify({
          permissions: {
            allow: ["Bash(git:*)", "Bash(git status)", "Bash(git log:*)"],
            deny: [],
            ask: [],
          },
        }),
      );

      // When: Run consolidate with --write
      const { stdout, exitCode } = await execa(
        "node",
        [
          CLI_PATH,
          "claude",
          "settings",
          "consolidate",
          "--write",
          "--root",
          tempDir,
          "--global-settings",
          globalSettings,
        ],
        {
          cwd: process.cwd(),
        },
      );

      // Then: Success and shows subsumption
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Subsumed permissions removed:");
      expect(stdout).toContain("Bash(git status)");
      expect(stdout).toContain("Bash(git log:*)");

      // And: Only broader permission remains
      const settings = JSON.parse(await readFile(globalSettings, "utf-8"));
      expect(settings.permissions.allow).toContain("Bash(git:*)");
      expect(settings.permissions.allow).not.toContain("Bash(git status)");
      expect(settings.permissions.allow).not.toContain("Bash(git log:*)");
    });
  });

  describe("Output file mode (--output-file)", () => {
    it("GIVEN projects with local settings WHEN running with --output-file THEN writes to specified file", async () => {
      // Given: Output file path
      const outputFile = join(tempDir, "output-settings.json");

      // When: Run consolidate with --output-file
      const { stdout, exitCode } = await execa(
        "node",
        [
          CLI_PATH,
          "claude",
          "settings",
          "consolidate",
          "--output-file",
          outputFile,
          "--root",
          tempDir,
          "--global-settings",
          globalSettings,
        ],
        {
          cwd: process.cwd(),
        },
      );

      // Then: Success and shows output file path
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Settings written to:");
      expect(stdout).toContain(outputFile);

      // And: Shows instructions to review and apply
      expect(stdout).toContain("Review the file");
      expect(stdout).toContain("--write");

      // And: Output file exists with merged settings
      const outputSettings = JSON.parse(await readFile(outputFile, "utf-8"));
      expect(outputSettings.permissions.allow).toContain("Bash(git:*)");
      expect(outputSettings.permissions.allow).toContain("Bash(npm:*)");
      expect(outputSettings.permissions.allow).toContain("Read(//tmp/**)");
      expect(outputSettings.permissions.allow).toHaveLength(3);

      // And: Global settings remain unchanged
      const globalContent = JSON.parse(await readFile(globalSettings, "utf-8"));
      expect(globalContent.permissions.allow).toHaveLength(0);
    });

    it("GIVEN nested output path WHEN running with --output-file THEN creates parent directories", async () => {
      // Given: Output file in nested directory
      const outputFile = join(tempDir, "nested", "dir", "settings.json");

      // When: Run consolidate with --output-file
      const { exitCode } = await execa(
        "node",
        [
          CLI_PATH,
          "claude",
          "settings",
          "consolidate",
          "--output-file",
          outputFile,
          "--root",
          tempDir,
          "--global-settings",
          globalSettings,
        ],
        {
          cwd: process.cwd(),
        },
      );

      // Then: Success
      expect(exitCode).toBe(0);

      // And: File is created in nested path
      const outputSettings = JSON.parse(await readFile(outputFile, "utf-8"));
      expect(outputSettings.permissions).toBeDefined();
    });
  });

  describe("Mutual exclusion validation", () => {
    it("GIVEN both --write and --output-file WHEN running consolidate THEN exits with error", async () => {
      // Given: Both write flags specified
      const outputFile = join(tempDir, "output.json");

      // When: Run consolidate with both flags
      try {
        await execa(
          "node",
          [
            CLI_PATH,
            "claude",
            "settings",
            "consolidate",
            "--write",
            "--output-file",
            outputFile,
            "--root",
            tempDir,
            "--global-settings",
            globalSettings,
          ],
          {
            cwd: process.cwd(),
          },
        );
        // Should not reach here
        expect.fail("Expected command to fail with mutually exclusive options");
      } catch (error: any) {
        // Then: Command fails with error message
        expect(error.exitCode).toBe(1);
        expect(error.stderr).toContain("mutually exclusive");
        expect(error.stderr).toContain("--write");
        expect(error.stderr).toContain("--output-file");
      }
    });
  });

  describe("Help text", () => {
    it("GIVEN help flag WHEN running consolidate THEN shows all options", async () => {
      // When: Run consolidate --help
      const { stdout, exitCode } = await execa(
        "node",
        [CLI_PATH, "claude", "settings", "consolidate", "--help"],
        {
          cwd: process.cwd(),
        },
      );

      // Then: Success and shows all options
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Consolidate permissions");
      expect(stdout).toContain("--write");
      expect(stdout).toContain("--output-file");
      expect(stdout).toContain("--root");
      expect(stdout).toContain("--global-settings");

      // And: Shows clear descriptions
      expect(stdout).toContain("preview only");
      expect(stdout).toContain("default:");
    });
  });
});
