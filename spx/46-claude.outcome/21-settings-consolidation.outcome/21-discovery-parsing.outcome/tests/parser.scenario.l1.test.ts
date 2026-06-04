/**
 * Unit Tests for Permission Parser
 *
 * Tests parsing of permission strings and settings files.
 * Level 1: Pure functions and file I/O with Node.js built-ins.
 */

import {
  parseAllPermissions,
  parseAllSettings,
  parsePermission,
  parseSettingsFile,
} from "@/lib/claude/permissions/parser";
import type { Permissions } from "@/lib/claude/permissions/types";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "vitest";

// ============================================================================
// parsePermission() Tests
// ============================================================================

describe("parsePermission", () => {
  test("parses simple command permission", () => {
    const result = parsePermission("Bash(git:*)", "allow");

    expect(result).toEqual({
      raw: "Bash(git:*)",
      type: "Bash",
      scope: "git:*",
      category: "allow",
    });
  });

  test("parses permission with complex scope", () => {
    const result = parsePermission("Bash(git -C ../hotfix branch --show-current)", "allow");

    expect(result).toEqual({
      raw: "Bash(git -C ../hotfix branch --show-current)",
      type: "Bash",
      scope: "git -C ../hotfix branch --show-current",
      category: "allow",
    });
  });

  test("parses file path permission", () => {
    const result = parsePermission("Read(file_path:/Users/user/Code/**)", "allow");

    expect(result).toEqual({
      raw: "Read(file_path:/Users/user/Code/**)",
      type: "Read",
      scope: "file_path:/Users/user/Code/**",
      category: "allow",
    });
  });

  test("parses domain permission", () => {
    const result = parsePermission("WebFetch(domain:github.com)", "deny");

    expect(result).toEqual({
      raw: "WebFetch(domain:github.com)",
      type: "WebFetch",
      scope: "domain:github.com",
      category: "deny",
    });
  });

  test("trims whitespace from type and scope", () => {
    // Note: Parentheses must be adjacent to type - spaces around parens not supported
    const result = parsePermission("  Bash(  git:*  )", "allow");

    expect(result.type).toBe("Bash");
    expect(result.scope).toBe("git:*");
  });

  test("handles deny category", () => {
    const result = parsePermission("Bash(rm:*)", "deny");

    expect(result.category).toBe("deny");
  });

  test("handles ask category", () => {
    const result = parsePermission("Bash(curl:*)", "ask");

    expect(result.category).toBe("ask");
  });

  test("throws error for malformed permission - no parentheses", () => {
    expect(() => parsePermission("Bash git:*", "allow")).toThrow(
      "Malformed permission string: \"Bash git:*\"",
    );
  });

  test("throws error for malformed permission - missing type", () => {
    expect(() => parsePermission("(git:*)", "allow")).toThrow("Malformed permission string");
  });

  test("throws error for malformed permission - missing scope", () => {
    expect(() => parsePermission("Bash()", "allow")).toThrow("Malformed permission string");
  });

  test("throws error for malformed permission - only opening paren", () => {
    expect(() => parsePermission("Bash(git:*", "allow")).toThrow("Malformed permission string");
  });

  test("throws error for empty string", () => {
    expect(() => parsePermission("", "allow")).toThrow("Malformed permission string");
  });
});

// ============================================================================
// parseAllPermissions() Tests
// ============================================================================

describe("parseAllPermissions", () => {
  test("parses permissions from all categories", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)", "Bash(npm:*)"],
      deny: ["Bash(rm:*)"],
      ask: ["Bash(curl:*)"],
    };

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(4);

    // Check allow permissions
    expect(result[0]).toMatchObject({ raw: "Bash(git:*)", category: "allow" });
    expect(result[1]).toMatchObject({ raw: "Bash(npm:*)", category: "allow" });

    // Check deny permission
    expect(result[2]).toMatchObject({ raw: "Bash(rm:*)", category: "deny" });

    // Check ask permission
    expect(result[3]).toMatchObject({ raw: "Bash(curl:*)", category: "ask" });
  });

  test("handles empty permissions object", () => {
    const permissions: Permissions = {};

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(0);
  });

  test("handles permissions with only allow", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)"],
    };

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("allow");
  });

  test("handles permissions with only deny", () => {
    const permissions: Permissions = {
      deny: ["Bash(rm:*)"],
    };

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("deny");
  });

  test("handles permissions with only ask", () => {
    const permissions: Permissions = {
      ask: ["Bash(curl:*)"],
    };

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("ask");
  });

  test("skips malformed permissions in allow", () => {
    const permissions: Permissions = {
      allow: ["Bash(git:*)", "InvalidFormat", "Bash(npm:*)"],
    };

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.raw)).toEqual(["Bash(git:*)", "Bash(npm:*)"]);
  });

  test("skips malformed permissions in deny", () => {
    const permissions: Permissions = {
      deny: ["Bash(rm:*)", "BadFormat", "Bash(dd:*)"],
    };

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.raw)).toEqual(["Bash(rm:*)", "Bash(dd:*)"]);
  });

  test("skips malformed permissions in ask", () => {
    const permissions: Permissions = {
      ask: ["Bash(curl:*)", "Wrong", "Bash(wget:*)"],
    };

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.raw)).toEqual(["Bash(curl:*)", "Bash(wget:*)"]);
  });

  test("handles empty arrays", () => {
    const permissions: Permissions = {
      allow: [],
      deny: [],
      ask: [],
    };

    const result = parseAllPermissions(permissions);

    expect(result).toHaveLength(0);
  });

  test("preserves order of permissions", () => {
    const permissions: Permissions = {
      allow: ["Bash(npm:*)", "Bash(git:*)", "Read(file_path:/tmp/**)"],
    };

    const result = parseAllPermissions(permissions);

    expect(result.map((p) => p.raw)).toEqual([
      "Bash(npm:*)",
      "Bash(git:*)",
      "Read(file_path:/tmp/**)",
    ]);
  });
});

// ============================================================================
// parseSettingsFile() Tests - Level 1 (File I/O)
// ============================================================================

describe("parseSettingsFile", () => {
  test("parses valid settings file", async () => {
    // Given: A valid settings.json file
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        permissions: {
          allow: ["Bash(git:*)"],
        },
      }),
    );

    try {
      // When: Parsing the file
      const result = await parseSettingsFile(settingsPath);

      // Then: Returns parsed ClaudeSettings
      expect(result).not.toBeNull();
      expect(result?.permissions?.allow).toEqual(["Bash(git:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("parses settings with all permission categories", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        permissions: {
          allow: ["Bash(git:*)"],
          deny: ["Bash(rm:*)"],
          ask: ["Bash(curl:*)"],
        },
      }),
    );

    try {
      const result = await parseSettingsFile(settingsPath);

      expect(result?.permissions?.allow).toEqual(["Bash(git:*)"]);
      expect(result?.permissions?.deny).toEqual(["Bash(rm:*)"]);
      expect(result?.permissions?.ask).toEqual(["Bash(curl:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("parses settings with additional fields", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        $schema: "https://example.com/schema.json",
        permissions: {
          allow: ["Bash(git:*)"],
        },
        includeCoAuthoredBy: true,
        customField: "value",
      }),
    );

    try {
      const result = await parseSettingsFile(settingsPath);

      expect(result?.$schema).toBe("https://example.com/schema.json");
      expect(result?.includeCoAuthoredBy).toBe(true);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns null for malformed JSON", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.json");

    await writeFile(settingsPath, "{ invalid json ");

    try {
      const result = await parseSettingsFile(settingsPath);

      expect(result).toBeNull();
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns null for non-existent file", async () => {
    const result = await parseSettingsFile("/nonexistent/path/settings.json");

    expect(result).toBeNull();
  });

  test("returns null when JSON is not an object", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.json");

    await writeFile(settingsPath, JSON.stringify("string value"));

    try {
      const result = await parseSettingsFile(settingsPath);

      expect(result).toBeNull();
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns parsed result even when JSON is an array", async () => {
    // Note: typeof array === "object", so arrays pass the object check
    // This is acceptable behavior - caller should validate structure
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.json");

    await writeFile(settingsPath, JSON.stringify(["array", "value"]));

    try {
      const result = await parseSettingsFile(settingsPath);

      // Arrays are objects in JavaScript, so they pass basic validation
      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(true);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns settings object even without permissions field", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const settingsPath = join(testDir, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify({
        includeCoAuthoredBy: true,
      }),
    );

    try {
      const result = await parseSettingsFile(settingsPath);

      expect(result).not.toBeNull();
      expect(result?.includeCoAuthoredBy).toBe(true);
      expect(result?.permissions).toBeUndefined();
    } finally {
      await rm(testDir, { recursive: true });
    }
  });
});

// ============================================================================
// parseAllSettings() Tests - Level 1 (File I/O)
// ============================================================================

describe("parseAllSettings", () => {
  test("parses multiple valid settings files", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const file1 = join(testDir, "settings1.json");
    const file2 = join(testDir, "settings2.json");

    await writeFile(
      file1,
      JSON.stringify({
        permissions: { allow: ["Bash(git:*)"] },
      }),
    );

    await writeFile(
      file2,
      JSON.stringify({
        permissions: { allow: ["Bash(npm:*)"] },
      }),
    );

    try {
      const result = await parseAllSettings([file1, file2]);

      expect(result).toHaveLength(2);
      expect(result[0].allow).toEqual(["Bash(git:*)"]);
      expect(result[1].allow).toEqual(["Bash(npm:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("skips files without permissions field", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const file1 = join(testDir, "settings1.json");
    const file2 = join(testDir, "settings2.json");

    await writeFile(
      file1,
      JSON.stringify({
        permissions: { allow: ["Bash(git:*)"] },
      }),
    );

    await writeFile(
      file2,
      JSON.stringify({
        includeCoAuthoredBy: true,
      }),
    );

    try {
      const result = await parseAllSettings([file1, file2]);

      expect(result).toHaveLength(1);
      expect(result[0].allow).toEqual(["Bash(git:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("skips malformed files", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const file1 = join(testDir, "settings1.json");
    const file2 = join(testDir, "settings2.json");

    await writeFile(
      file1,
      JSON.stringify({
        permissions: { allow: ["Bash(git:*)"] },
      }),
    );

    await writeFile(file2, "{ malformed json ");

    try {
      const result = await parseAllSettings([file1, file2]);

      expect(result).toHaveLength(1);
      expect(result[0].allow).toEqual(["Bash(git:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("skips non-existent files", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const file1 = join(testDir, "settings.json");

    await writeFile(
      file1,
      JSON.stringify({
        permissions: { allow: ["Bash(git:*)"] },
      }),
    );

    try {
      const result = await parseAllSettings([file1, "/nonexistent/file.json"]);

      expect(result).toHaveLength(1);
      expect(result[0].allow).toEqual(["Bash(git:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("returns empty array for empty input", async () => {
    const result = await parseAllSettings([]);

    expect(result).toHaveLength(0);
  });

  test("handles files with all three permission categories", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    const file = join(testDir, "settings.json");

    await writeFile(
      file,
      JSON.stringify({
        permissions: {
          allow: ["Bash(git:*)"],
          deny: ["Bash(rm:*)"],
          ask: ["Bash(curl:*)"],
        },
      }),
    );

    try {
      const result = await parseAllSettings([file]);

      expect(result).toHaveLength(1);
      expect(result[0].allow).toEqual(["Bash(git:*)"]);
      expect(result[0].deny).toEqual(["Bash(rm:*)"]);
      expect(result[0].ask).toEqual(["Bash(curl:*)"]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });

  test("preserves order of files", async () => {
    const testDir = join(tmpdir(), `parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const file1 = join(testDir, "a.json");
    const file2 = join(testDir, "b.json");
    const file3 = join(testDir, "c.json");

    await writeFile(file1, JSON.stringify({ permissions: { allow: ["Bash(a:*)"] } }));
    await writeFile(file2, JSON.stringify({ permissions: { allow: ["Bash(b:*)"] } }));
    await writeFile(file3, JSON.stringify({ permissions: { allow: ["Bash(c:*)"] } }));

    try {
      const result = await parseAllSettings([file1, file2, file3]);

      expect(result.map((p) => p.allow)).toEqual([["Bash(a:*)"], ["Bash(b:*)"], ["Bash(c:*)"]]);
    } finally {
      await rm(testDir, { recursive: true });
    }
  });
});
