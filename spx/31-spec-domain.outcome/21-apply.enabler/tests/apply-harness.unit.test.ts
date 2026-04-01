/**
 * Unit tests for apply test harness.
 *
 * Test Level: 1 (Unit)
 * - Harness creates temp dirs (fs is Level 1)
 * - Verifies directory structure, file writing, cleanup
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COMMENT_CHAR, EXCLUDE_FILENAME, SPX_PREFIX } from "@/spec/apply/exclude";
import { createApplyHarness } from "@/spec/apply/testing/harness";

describe("createApplyHarness", () => {
  it("GIVEN no arguments WHEN created THEN temp dir exists with spx/ subdirectory", async () => {
    const harness = await createApplyHarness();
    try {
      const entries = await readdir(harness.projectDir);
      expect(entries).toContain("spx");
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a harness WHEN cleanup is called THEN temp dir no longer exists", async () => {
    const harness = await createApplyHarness();
    const dir = harness.projectDir;
    expect(existsSync(dir)).toBe(true);

    await harness.cleanup();

    expect(existsSync(dir)).toBe(false);
  });
});

describe("writeExclude", () => {
  it("GIVEN node paths WHEN writeExclude is called THEN spx/EXCLUDE contains those paths", async () => {
    const harness = await createApplyHarness();
    try {
      const nodes = ["21-foo.enabler", "32-bar.outcome"];
      await harness.writeExclude(nodes);

      const content = await readFile(
        join(harness.projectDir, SPX_PREFIX, EXCLUDE_FILENAME),
        "utf-8",
      );

      for (const node of nodes) {
        expect(content).toContain(node);
      }
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN node paths WHEN writeExclude is called THEN file starts with comment header", async () => {
    const harness = await createApplyHarness();
    try {
      await harness.writeExclude(["21-foo.enabler"]);

      const content = await readFile(
        join(harness.projectDir, SPX_PREFIX, EXCLUDE_FILENAME),
        "utf-8",
      );

      expect(content.startsWith(COMMENT_CHAR)).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });
});

describe("writeConfig / readConfig", () => {
  it("GIVEN content WHEN writeConfig then readConfig THEN returns same content", async () => {
    const harness = await createApplyHarness();
    try {
      const original = "[project]\nname = \"test\"\n";
      await harness.writeConfig("pyproject.toml", original);
      const read = await harness.readConfig("pyproject.toml");

      expect(read).toBe(original);
    } finally {
      await harness.cleanup();
    }
  });
});
