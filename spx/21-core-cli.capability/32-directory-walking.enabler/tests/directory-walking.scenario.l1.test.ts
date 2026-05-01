import type { SpxConfig } from "@/config/defaults";
import { Scanner } from "@/lib/spec-legacy/scanner/scanner";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Scanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spx-scanner-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("constructor injection", () => {
    it("GIVEN custom config WHEN constructing Scanner THEN accepts config without throwing", () => {
      const config: SpxConfig = {
        specs: {
          root: "custom-specs",
          work: {
            dir: "custom-work",
            statusDirs: { doing: "active", backlog: "queue", done: "completed" },
          },
          decisions: "adrs",
        },
        sessions: {
          dir: ".custom/sessions",
          statusDirs: { todo: "todo", doing: "doing", archive: "archive" },
        },
      };

      expect(() => new Scanner(tempDir, config)).not.toThrow();
    });
  });

  describe("config.specs.root", () => {
    it("GIVEN scanner with custom specs.root WHEN scanning THEN discovers items under custom root", async () => {
      const customRoot = "documentation";
      await fs.mkdir(
        path.join(tempDir, customRoot, "work", "doing", "capability-10_test"),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(tempDir, customRoot, "work", "doing", "capability-10_test", "test.capability.md"),
        "# Test Capability\n",
      );

      const config: SpxConfig = {
        specs: {
          root: customRoot,
          work: {
            dir: "work",
            statusDirs: { doing: "doing", backlog: "backlog", done: "archive" },
          },
          decisions: "decisions",
        },
        sessions: {
          dir: ".spx/sessions",
          statusDirs: { todo: "todo", doing: "doing", archive: "archive" },
        },
      };

      const scanner = new Scanner(tempDir, config);
      const workItems = await scanner.scan();

      expect(workItems.length).toBeGreaterThan(0);
      expect(workItems[0].path).toContain(customRoot);
    });
  });

  describe("config.specs.work.dir", () => {
    it("GIVEN scanner with custom work.dir WHEN scanning THEN discovers items under custom work directory", async () => {
      const customWorkDir = "active-items";
      await fs.mkdir(
        path.join(tempDir, "specs", customWorkDir, "doing", "feature-20_test"),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(tempDir, "specs", customWorkDir, "doing", "feature-20_test", "test.feature.md"),
        "# Test Feature\n",
      );

      const config: SpxConfig = {
        specs: {
          root: "specs",
          work: {
            dir: customWorkDir,
            statusDirs: { doing: "doing", backlog: "backlog", done: "archive" },
          },
          decisions: "decisions",
        },
        sessions: {
          dir: ".spx/sessions",
          statusDirs: { todo: "todo", doing: "doing", archive: "archive" },
        },
      };

      const scanner = new Scanner(tempDir, config);
      const workItems = await scanner.scan();

      expect(workItems.length).toBeGreaterThan(0);
      expect(workItems[0].path).toContain(customWorkDir);
    });
  });

  describe("config.specs.work.statusDirs", () => {
    it("GIVEN scanner with custom doing dir WHEN scanning THEN discovers items under custom status directory", async () => {
      await fs.mkdir(
        path.join(tempDir, "specs", "work", "in-progress", "story-30_test"),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(tempDir, "specs", "work", "in-progress", "story-30_test", "test.story.md"),
        "# Test Story\n",
      );

      const config: SpxConfig = {
        specs: {
          root: "specs",
          work: {
            dir: "work",
            statusDirs: { doing: "in-progress", backlog: "queue", done: "completed" },
          },
          decisions: "decisions",
        },
        sessions: {
          dir: ".spx/sessions",
          statusDirs: { todo: "todo", doing: "doing", archive: "archive" },
        },
      };

      const scanner = new Scanner(tempDir, config);
      const workItems = await scanner.scan();

      expect(workItems.length).toBeGreaterThan(0);
      expect(workItems[0].path).toContain("in-progress");
    });
  });

  describe("fully custom config", () => {
    it("GIVEN all-custom config WHEN scanning THEN discovers items using all custom path segments", async () => {
      const customRoot = "docs/specifications";
      const customWorkDir = "active";
      const customDoingDir = "current";
      await fs.mkdir(
        path.join(tempDir, customRoot, customWorkDir, customDoingDir, "capability-42_custom"),
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

      const config: SpxConfig = {
        specs: {
          root: customRoot,
          work: {
            dir: customWorkDir,
            statusDirs: { doing: customDoingDir, backlog: "future", done: "finished" },
          },
          decisions: "adrs",
        },
        sessions: {
          dir: ".custom-spx/handoffs",
          statusDirs: { todo: "todo", doing: "doing", archive: "archive" },
        },
      };

      const scanner = new Scanner(tempDir, config);
      const workItems = await scanner.scan();

      expect(workItems.length).toBeGreaterThan(0);
      expect(workItems[0].path).toContain(customRoot.replace("/", path.sep));
      expect(workItems[0].path).toContain(customWorkDir);
      expect(workItems[0].path).toContain(customDoingDir);
    });
  });

  describe("path helper methods", () => {
    it("GIVEN custom config WHEN calling path helpers THEN all paths derive from config values", () => {
      const config: SpxConfig = {
        specs: {
          root: "my-specs",
          work: {
            dir: "my-work",
            statusDirs: { doing: "my-doing", backlog: "my-backlog", done: "my-done" },
          },
          decisions: "my-decisions",
        },
        sessions: {
          dir: ".my-sessions",
          statusDirs: { todo: "todo", doing: "doing", archive: "archive" },
        },
      };

      const scanner = new Scanner("/project", config);

      expect(scanner.getSpecsRootPath()).toBe(path.join("/project", "my-specs"));
      expect(scanner.getWorkPath()).toBe(path.join("/project", "my-specs", "my-work"));
      expect(scanner.getDoingPath()).toBe(path.join("/project", "my-specs", "my-work", "my-doing"));
      expect(scanner.getBacklogPath()).toBe(
        path.join("/project", "my-specs", "my-work", "my-backlog"),
      );
      expect(scanner.getDonePath()).toBe(path.join("/project", "my-specs", "my-work", "my-done"));
    });
  });
});
