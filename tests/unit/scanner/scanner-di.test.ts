/**
 * Level 1: Scanner Dependency Injection
 *
 * These tests verify that the scanner correctly accepts and uses config
 * via constructor injection, replacing all hardcoded paths with config
 * references.
 */

import type { SpxConfig } from "@/config/defaults";
import { Scanner } from "@/scanner/scanner";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Story 21: Scanner Dependency Injection", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test fixtures
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spx-scanner-test-"));
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Scanner constructor accepts config", () => {
    it("GIVEN custom config WHEN creating scanner THEN accepts config parameter", () => {
      const customConfig: SpxConfig = {
        specs: {
          root: "custom-specs",
          work: {
            dir: "custom-work",
            statusDirs: {
              doing: "active",
              backlog: "queue",
              done: "completed",
            },
          },
          decisions: "adrs",
        },
        sessions: {
          dir: ".custom/sessions",
          statusDirs: {
            todo: "todo",
            doing: "doing",
            archive: "archive",
          },
        },
      };

      // Should not throw
      expect(() => new Scanner(tempDir, customConfig)).not.toThrow();
    });

    it("GIVEN scanner with config WHEN accessing THEN scanner is defined", () => {
      const customConfig: SpxConfig = {
        specs: {
          root: "docs",
          work: {
            dir: "items",
            statusDirs: {
              doing: "in-progress",
              backlog: "backlog",
              done: "archive",
            },
          },
          decisions: "decisions",
        },
        sessions: {
          dir: ".spx/sessions",
          statusDirs: {
            todo: "todo",
            doing: "doing",
            archive: "archive",
          },
        },
      };

      const scanner = new Scanner(tempDir, customConfig);

      expect(scanner).toBeDefined();
    });
  });

  describe("Scanner uses config.specs.root", () => {
    it("GIVEN scanner with custom specs.root WHEN scanning THEN uses custom root path", async () => {
      // Given: Directory structure with custom specs root
      const customRoot = "documentation";
      await fs.mkdir(
        path.join(tempDir, customRoot, "work", "doing", "capability-10_test"),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(
          tempDir,
          customRoot,
          "work",
          "doing",
          "capability-10_test",
          "test.capability.md",
        ),
        "# Test Capability\n",
      );

      const customConfig: SpxConfig = {
        specs: {
          root: customRoot,
          work: {
            dir: "work",
            statusDirs: {
              doing: "doing",
              backlog: "backlog",
              done: "archive",
            },
          },
          decisions: "decisions",
        },
        sessions: {
          dir: ".spx/sessions",
          statusDirs: {
            todo: "todo",
            doing: "doing",
            archive: "archive",
          },
        },
      };

      // When: Scanner scans with custom config
      const scanner = new Scanner(tempDir, customConfig);
      const workItems = await scanner.scan();

      // Then: Scanner found work items under custom root
      expect(workItems.length).toBeGreaterThan(0);
      expect(workItems[0].path).toContain(customRoot);
    });
  });

  describe("Scanner uses config.specs.work.dir", () => {
    it("GIVEN scanner with custom work.dir WHEN scanning THEN uses custom work directory", async () => {
      // Given: Directory structure with custom work directory
      const customWorkDir = "active-items";
      await fs.mkdir(
        path.join(tempDir, "specs", customWorkDir, "doing", "feature-20_test"),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(
          tempDir,
          "specs",
          customWorkDir,
          "doing",
          "feature-20_test",
          "test.feature.md",
        ),
        "# Test Feature\n",
      );

      const customConfig: SpxConfig = {
        specs: {
          root: "specs",
          work: {
            dir: customWorkDir,
            statusDirs: {
              doing: "doing",
              backlog: "backlog",
              done: "archive",
            },
          },
          decisions: "decisions",
        },
        sessions: {
          dir: ".spx/sessions",
          statusDirs: {
            todo: "todo",
            doing: "doing",
            archive: "archive",
          },
        },
      };

      // When: Scanner scans with custom config
      const scanner = new Scanner(tempDir, customConfig);
      const workItems = await scanner.scan();

      // Then: Scanner found work items under custom work directory
      expect(workItems.length).toBeGreaterThan(0);
      expect(workItems[0].path).toContain(customWorkDir);
    });
  });

  describe("Scanner uses config.specs.work.statusDirs", () => {
    it("GIVEN scanner with custom statusDirs WHEN scanning THEN uses custom status directories", async () => {
      // Given: Directory structure with custom status directories
      await fs.mkdir(
        path.join(tempDir, "specs", "work", "in-progress", "story-30_test"),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(
          tempDir,
          "specs",
          "work",
          "in-progress",
          "story-30_test",
          "test.story.md",
        ),
        "# Test Story\n",
      );

      const customConfig: SpxConfig = {
        specs: {
          root: "specs",
          work: {
            dir: "work",
            statusDirs: {
              doing: "in-progress", // Custom status dir name
              backlog: "queue",
              done: "completed",
            },
          },
          decisions: "decisions",
        },
        sessions: {
          dir: ".spx/sessions",
          statusDirs: {
            todo: "todo",
            doing: "doing",
            archive: "archive",
          },
        },
      };

      // When: Scanner scans with custom config
      const scanner = new Scanner(tempDir, customConfig);
      const workItems = await scanner.scan();

      // Then: Scanner found work items under custom status directory
      expect(workItems.length).toBeGreaterThan(0);
      expect(workItems[0].path).toContain("in-progress");
    });
  });

  describe("Scanner works with completely custom config", () => {
    it("GIVEN scanner with all custom paths WHEN scanning THEN finds work items correctly", async () => {
      // Given: Completely custom directory structure
      const customRoot = "docs/specifications";
      const customWorkDir = "active";
      const customDoingDir = "current";
      await fs.mkdir(
        path.join(
          tempDir,
          customRoot,
          customWorkDir,
          customDoingDir,
          "capability-42_custom",
        ),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(
          tempDir,
          customRoot,
          customWorkDir,
          customDoingDir,
          "capability-42_custom",
          "custom.capability.md",
        ),
        "# Custom Capability\n",
      );

      const customConfig: SpxConfig = {
        specs: {
          root: customRoot,
          work: {
            dir: customWorkDir,
            statusDirs: {
              doing: customDoingDir,
              backlog: "future",
              done: "finished",
            },
          },
          decisions: "adrs",
        },
        sessions: {
          dir: ".custom-spx/handoffs",
          statusDirs: {
            todo: "todo",
            doing: "doing",
            archive: "archive",
          },
        },
      };

      // When: Scanner scans with completely custom config
      const scanner = new Scanner(tempDir, customConfig);
      const workItems = await scanner.scan();

      // Then: Scanner found work items using all custom paths
      expect(workItems.length).toBeGreaterThan(0);
      expect(workItems[0].path).toContain(customRoot.replace("/", path.sep));
      expect(workItems[0].path).toContain(customWorkDir);
      expect(workItems[0].path).toContain(customDoingDir);
    });
  });

  describe("Scanner path helper methods use config", () => {
    it("GIVEN custom config WHEN getting paths THEN returns config-based paths", () => {
      const customConfig: SpxConfig = {
        specs: {
          root: "my-specs",
          work: {
            dir: "my-work",
            statusDirs: {
              doing: "my-doing",
              backlog: "my-backlog",
              done: "my-done",
            },
          },
          decisions: "my-decisions",
        },
        sessions: {
          dir: ".my-sessions",
          statusDirs: {
            todo: "todo",
            doing: "doing",
            archive: "archive",
          },
        },
      };

      const scanner = new Scanner("/project", customConfig);

      // Verify all path methods use config values
      expect(scanner.getSpecsRootPath()).toBe(
        path.join("/project", "my-specs"),
      );
      expect(scanner.getWorkPath()).toBe(
        path.join("/project", "my-specs", "my-work"),
      );
      expect(scanner.getDoingPath()).toBe(
        path.join("/project", "my-specs", "my-work", "my-doing"),
      );
      expect(scanner.getBacklogPath()).toBe(
        path.join("/project", "my-specs", "my-work", "my-backlog"),
      );
      expect(scanner.getDonePath()).toBe(
        path.join("/project", "my-specs", "my-work", "my-done"),
      );
    });
  });
});
