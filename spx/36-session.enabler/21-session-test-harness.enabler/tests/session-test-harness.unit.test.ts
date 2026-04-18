/**
 * Unit tests for session test harness.
 *
 * Test Level: 1 (Unit)
 * - Harness creates temp dirs (fs is Level 1)
 * - Verifies directory structure, file writing, cleanup
 *
 * Assertions covered from session-test-harness.md:
 * - S1: createSessionHarness creates subdirs per SESSION_STATUSES
 * - S2: writeSession creates markdown with YAML in correct subdir
 * - S3: cleanup removes temp dir
 * - P1: subdirectory names match DEFAULT_CONFIG
 * - P2: statusDir returns absolute path for every SessionStatus
 */

import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { createSessionHarness } from "@/session/testing/harness";
import { SESSION_STATUSES } from "@/session/types";

const { statusDirs } = DEFAULT_CONFIG.sessions;

describe("createSessionHarness", () => {
  // S1: creates temp dir with subdirs per SESSION_STATUSES
  it("GIVEN no arguments WHEN created THEN temp dir exists with one subdir per SESSION_STATUSES member", async () => {
    const harness = await createSessionHarness();
    try {
      const entries = await readdir(harness.sessionsDir);
      const expected = SESSION_STATUSES.map((s) => statusDirs[s]);
      expect(entries.sort()).toEqual([...expected].sort());

      for (const status of SESSION_STATUSES) {
        const dirStat = await stat(harness.statusDir(status));
        expect(dirStat.isDirectory()).toBe(true);
      }
    } finally {
      await harness.cleanup();
    }
  });

  // S3: cleanup removes temp dir
  it("GIVEN a harness WHEN cleanup is called THEN temp dir no longer exists", async () => {
    const harness = await createSessionHarness();
    const dir = harness.sessionsDir;
    expect(existsSync(dir)).toBe(true);

    await harness.cleanup();

    expect(existsSync(dir)).toBe(false);
  });
});

describe("writeSession", () => {
  // S2: creates markdown with YAML front matter in correct subdir
  it("GIVEN a harness WHEN writeSession is called THEN file exists in correct status subdir with YAML front matter", async () => {
    const harness = await createSessionHarness();
    try {
      const status = SESSION_STATUSES[0];
      const id = "2026-01-10_10-00-00";

      await harness.writeSession(status, id, { priority: "high", tags: ["test", "ci"] });

      const filePath = join(harness.statusDir(status), `${id}.md`);
      const content = await readFile(filePath, "utf-8");

      expect(content).toContain("priority: high");
      expect(content).toContain("tags:");
      expect(content).toContain("test");
      expect(content).toContain("ci");
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN no metadata overrides WHEN writeSession is called THEN file has default priority", async () => {
    const harness = await createSessionHarness();
    try {
      const status = SESSION_STATUSES[1];
      const id = "2026-01-11_10-00-00";

      await harness.writeSession(status, id);

      const filePath = join(harness.statusDir(status), `${id}.md`);
      const content = await readFile(filePath, "utf-8");

      expect(content).toContain("priority: medium");
    } finally {
      await harness.cleanup();
    }
  });
});

describe("statusDir", () => {
  // P2: returns absolute path for every valid SessionStatus
  it("GIVEN a harness WHEN statusDir called for every SESSION_STATUS THEN returns absolute paths", async () => {
    const harness = await createSessionHarness();
    try {
      for (const status of SESSION_STATUSES) {
        const dir = harness.statusDir(status);
        expect(isAbsolute(dir)).toBe(true);
      }
    } finally {
      await harness.cleanup();
    }
  });

  // P1: subdirectory names match DEFAULT_CONFIG
  it("GIVEN a harness WHEN statusDir called THEN path ends with DEFAULT_CONFIG.sessions.statusDirs[status]", async () => {
    const harness = await createSessionHarness();
    try {
      for (const status of SESSION_STATUSES) {
        const dir = harness.statusDir(status);
        const expectedSuffix = statusDirs[status];
        expect(dir.endsWith(expectedSuffix)).toBe(true);
      }
    } finally {
      await harness.cleanup();
    }
  });
});
