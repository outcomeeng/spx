/**
 * Unit tests for apply-exclude enabler.
 *
 * Test Level: 1 (Unit)
 * - Pure functions operating on strings (no FS, no external tools)
 *
 * Assertions covered from apply-exclude.md:
 * - S1: Flat node path → 3 tool configs
 * - S2: Comments and blank lines → stripped
 * - S3: Nested path → correct escaping
 * - S4: Old entries replaced with new
 * - S5: Already in sync → no changes
 * - S6: EXCLUDE missing → error code 1
 * - M1: Node path → pytest, mypy, pyright mappings
 * - P1: Idempotent
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  applyExcludeCommand,
  COMMENT_CHAR,
  isExcludedEntry,
  MYPY_SECTION,
  NODE_SUFFIXES,
  PYRIGHT_SECTION,
  PYTEST_SECTION,
  pythonAdapter,
  readExcludedNodes,
  SPX_PREFIX,
  toMypyRegex,
  toPyrightPath,
  toPytestIgnore,
  validateNodePath,
} from "@/spec/apply/exclude";
import { arbitraryNodePath } from "@/spec/apply/testing/generators";

// ---------------------------------------------------------------------------
// Fixtures — built from exported constants, not hardcoded strings
// ---------------------------------------------------------------------------

const MINIMAL_PYPROJECT = [
  "[project]",
  "name = \"my-project\"",
  "",
  `[${PYTEST_SECTION}]`,
  "addopts = \"--import-mode=importlib --strict-markers\"",
  "",
  `[${MYPY_SECTION}]`,
  "exclude = [",
  "    \"build/\",",
  "]",
  "",
  `[${PYRIGHT_SECTION}]`,
  "exclude = [",
  "    \"build/\",",
  "]",
  "",
  "[tool.ruff]",
  "line-length = 120",
  "",
].join("\n");

const FLAT_NODE = "41-apply-exclude.enabler";
const NESTED_NODE = "57-subsystems.outcome/32-risc-v.outcome";

// ---------------------------------------------------------------------------
// S2: Comments and blank lines stripped
// ---------------------------------------------------------------------------

describe("readExcludedNodes", () => {
  it("GIVEN content with comments and blank lines WHEN parsed THEN only non-comment non-blank lines returned", () => {
    const content = `\
# Nodes excluded from the quality gate.
# Specs and tests exist. Implementation does not.

${FLAT_NODE}

# Another comment
${NESTED_NODE}
`;
    const nodes = readExcludedNodes(content);

    expect(nodes).toEqual([FLAT_NODE, NESTED_NODE]);
  });

  it("GIVEN empty content WHEN parsed THEN returns empty array", () => {
    expect(readExcludedNodes("")).toEqual([]);
  });

  it("GIVEN only comments WHEN parsed THEN returns empty array", () => {
    expect(readExcludedNodes(`${COMMENT_CHAR} just a comment\n`)).toEqual([]);
  });

  it("GIVEN lines with leading/trailing whitespace WHEN parsed THEN trims them", () => {
    const content = `  ${FLAT_NODE}  \n`;
    expect(readExcludedNodes(content)).toEqual([FLAT_NODE]);
  });
});

// ---------------------------------------------------------------------------
// M1: Node path → pytest, mypy, pyright mappings
// ---------------------------------------------------------------------------

describe("node path mappings", () => {
  it("GIVEN flat node path WHEN mapped THEN pytest ignore is --ignore=spx/{node}/", () => {
    expect(toPytestIgnore(FLAT_NODE)).toBe(`--ignore=${SPX_PREFIX}${FLAT_NODE}/`);
  });

  it("GIVEN flat node path WHEN mapped THEN pyright path is spx/{node}/", () => {
    expect(toPyrightPath(FLAT_NODE)).toBe(`${SPX_PREFIX}${FLAT_NODE}/`);
  });

  it("GIVEN flat node path WHEN mapped THEN mypy regex is ^spx/{escaped_node}/", () => {
    const regex = toMypyRegex(FLAT_NODE);
    expect(regex).toContain("^");
    expect(regex).toContain(SPX_PREFIX);
    // Dots and hyphens are escaped
    expect(regex).toContain("\\.");
    expect(regex).toContain("\\-");
  });

  it("GIVEN nested node path WHEN mapped THEN all three contain full nested path", () => {
    const pytest = toPytestIgnore(NESTED_NODE);
    const mypy = toMypyRegex(NESTED_NODE);
    const pyright = toPyrightPath(NESTED_NODE);

    expect(pytest).toBe(`--ignore=${SPX_PREFIX}${NESTED_NODE}/`);
    expect(pyright).toBe(`${SPX_PREFIX}${NESTED_NODE}/`);
    // Mypy regex escapes the nested path correctly
    expect(mypy).toContain("57\\-subsystems\\.outcome");
    expect(mypy).toContain("32\\-risc\\-v\\.outcome");
  });
});

// ---------------------------------------------------------------------------
// isExcludedEntry — detection by value pattern
// ---------------------------------------------------------------------------

describe("isExcludedEntry", () => {
  it("GIVEN a pytest ignore for an outcome node WHEN checked THEN returns true", () => {
    expect(isExcludedEntry(`--ignore=${SPX_PREFIX}${FLAT_NODE}/`)).toBe(true);
  });

  it("GIVEN a mypy regex for an outcome node WHEN checked THEN returns true", () => {
    expect(isExcludedEntry(toMypyRegex(NESTED_NODE))).toBe(true);
  });

  it("GIVEN a pyright path for an enabler node WHEN checked THEN returns true", () => {
    expect(isExcludedEntry(`${SPX_PREFIX}21-harness.enabler/`)).toBe(true);
  });

  it("GIVEN a non-spx entry WHEN checked THEN returns false", () => {
    expect(isExcludedEntry("build/")).toBe(false);
    expect(isExcludedEntry("--strict-markers")).toBe(false);
    expect(isExcludedEntry("--import-mode=importlib")).toBe(false);
  });

  for (const suffix of NODE_SUFFIXES) {
    it(`GIVEN entry with suffix ${suffix} and spx/ prefix WHEN checked THEN returns true`, () => {
      expect(isExcludedEntry(`${SPX_PREFIX}10-node${suffix}`)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// S1: Flat node → 3 tool configs
// S3: Nested path → correct escaping
// S4: Old entries replaced
// S5: Already in sync → no changes
// P1: Idempotent
// ---------------------------------------------------------------------------

describe("pythonAdapter.applyExclusions", () => {
  // S1: Flat node path produces all three tool configs
  it("GIVEN pyproject and one flat node WHEN applied THEN contains pytest ignore, mypy regex, and pyright path", () => {
    const result = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, [FLAT_NODE]);

    expect(result.changed).toBe(true);
    expect(result.content).toContain(toPytestIgnore(FLAT_NODE));
    expect(result.content).toContain(toMypyRegex(FLAT_NODE));
    expect(result.content).toContain(toPyrightPath(FLAT_NODE));
  });

  // S3: Nested path with correct escaping
  it("GIVEN pyproject and nested node WHEN applied THEN all three configs contain full nested path", () => {
    const result = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, [NESTED_NODE]);

    expect(result.changed).toBe(true);
    expect(result.content).toContain(toPytestIgnore(NESTED_NODE));
    expect(result.content).toContain(toMypyRegex(NESTED_NODE));
    expect(result.content).toContain(toPyrightPath(NESTED_NODE));
  });

  // S4: Previously-applied entries replaced
  it("GIVEN pyproject with old excluded entries WHEN applied with different nodes THEN old entries replaced", () => {
    const first = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, [FLAT_NODE]);
    expect(first.changed).toBe(true);

    const second = pythonAdapter.applyExclusions(first.content, [NESTED_NODE]);
    expect(second.changed).toBe(true);

    expect(second.content).not.toContain(toPytestIgnore(FLAT_NODE));
    expect(second.content).not.toContain(toPyrightPath(FLAT_NODE));
    expect(second.content).toContain(toPytestIgnore(NESTED_NODE));
    expect(second.content).toContain(toPyrightPath(NESTED_NODE));
  });

  // S5: Already in sync → no changes
  it("GIVEN pyproject already in sync WHEN applied again THEN no changes made", () => {
    const first = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, [FLAT_NODE]);
    const second = pythonAdapter.applyExclusions(first.content, [FLAT_NODE]);

    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  // P1: Idempotent
  it("GIVEN same EXCLUDE content WHEN applied twice THEN produces identical output", () => {
    const nodes = [FLAT_NODE, NESTED_NODE];
    const first = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, nodes);
    const second = pythonAdapter.applyExclusions(first.content, nodes);

    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  // Preserve non-excluded entries
  it("GIVEN pyproject with non-excluded entries WHEN applied THEN non-excluded entries preserved", () => {
    const result = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, [FLAT_NODE]);

    expect(result.content).toContain("--import-mode=importlib");
    expect(result.content).toContain("--strict-markers");
    expect(result.content).toContain("\"build/\"");
  });

  // Preserve structure outside edited sections
  it("GIVEN pyproject with ruff config WHEN applied THEN ruff section untouched", () => {
    const result = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, [FLAT_NODE]);

    expect(result.content).toContain("[tool.ruff]");
    expect(result.content).toContain("line-length = 120");
  });

  // Empty nodes list removes all excluded entries
  it("GIVEN pyproject with excluded entries WHEN applied with empty node list THEN excluded entries removed", () => {
    const withEntries = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, [FLAT_NODE]);
    const cleared = pythonAdapter.applyExclusions(withEntries.content, []);

    expect(cleared.changed).toBe(true);
    expect(cleared.content).not.toContain(toPytestIgnore(FLAT_NODE));
    expect(cleared.content).not.toContain(toPyrightPath(FLAT_NODE));
  });
});

// ---------------------------------------------------------------------------
// S6: EXCLUDE missing → error code 1
// ---------------------------------------------------------------------------

describe("applyExcludeCommand", () => {
  it("GIVEN EXCLUDE does not exist WHEN command runs THEN returns exit code 1", async () => {
    const result = await applyExcludeCommand({
      cwd: "/fake/project",
      deps: {
        readFile: () => Promise.reject(new Error("ENOENT")),
        writeFile: () => Promise.resolve(),
        fileExists: () => Promise.resolve(false),
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("not found");
  });

  it("GIVEN valid EXCLUDE and pyproject WHEN command runs THEN returns exit code 0", async () => {
    let written = "";
    const result = await applyExcludeCommand({
      cwd: "/fake/project",
      deps: {
        readFile: async (path: string) => {
          if (path.includes("EXCLUDE")) return FLAT_NODE;
          if (path.includes("pyproject")) return MINIMAL_PYPROJECT;
          throw new Error(`unexpected read: ${path}`);
        },
        writeFile: async (_path: string, content: string) => {
          written = content;
        },
        fileExists: () => Promise.resolve(true),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(written).toContain(toPytestIgnore(FLAT_NODE));
  });

  it("GIVEN no supported config file WHEN command runs THEN returns exit code 1", async () => {
    const result = await applyExcludeCommand({
      cwd: "/fake/project",
      deps: {
        readFile: () => Promise.reject(new Error("ENOENT")),
        writeFile: () => Promise.resolve(),
        fileExists: async (path: string) => path.includes("EXCLUDE"),
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no supported config file");
  });
});

// ---------------------------------------------------------------------------
// Property-based tests (fast-check)
// ---------------------------------------------------------------------------

describe("mapping properties", () => {
  it("PROPERTY: toPytestIgnore always starts with --ignore= and contains SPX_PREFIX", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        const result = toPytestIgnore(node);
        expect(result).toMatch(new RegExp(`^--ignore=${SPX_PREFIX}`));
        expect(result).toMatch(/\/$/);
      }),
    );
  });

  it("PROPERTY: toMypyRegex always starts with ^ (anchored regex)", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        const result = toMypyRegex(node);
        expect(result.startsWith("^")).toBe(true);
        expect(result).toMatch(/\/$/);
      }),
    );
  });

  it("PROPERTY: toPyrightPath always starts with SPX_PREFIX", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        const result = toPyrightPath(node);
        expect(result).toMatch(new RegExp(`^${SPX_PREFIX}`));
        expect(result).toMatch(/\/$/);
      }),
    );
  });

  it("PROPERTY: isExcludedEntry round-trips — all mapping outputs are detected as excluded", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        expect(isExcludedEntry(toPytestIgnore(node))).toBe(true);
        expect(isExcludedEntry(toMypyRegex(node))).toBe(true);
        expect(isExcludedEntry(toPyrightPath(node))).toBe(true);
      }),
    );
  });

  it("PROPERTY: isExcludedEntry rejects non-spx entries", () => {
    fc.assert(
      fc.property(
        fc
          .string({
            unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz/-."),
            minLength: 1,
            maxLength: 40,
          })
          .filter((s: string) => !s.includes(SPX_PREFIX)),
        (val: string) => {
          expect(isExcludedEntry(val)).toBe(false);
        },
      ),
    );
  });
});

describe("idempotency property", () => {
  it("PROPERTY: applying twice with same nodes produces identical output", () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryNodePath(), { minLength: 1, maxLength: 5 }),
        (nodes) => {
          const first = pythonAdapter.applyExclusions(MINIMAL_PYPROJECT, nodes);
          const second = pythonAdapter.applyExclusions(first.content, nodes);
          expect(second.changed).toBe(false);
          expect(second.content).toBe(first.content);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Adversarial: path traversal, TOML injection, termination
// ---------------------------------------------------------------------------

describe("validateNodePath", () => {
  it("GIVEN path traversal with .. WHEN validated THEN rejects", () => {
    expect(validateNodePath("../etc/passwd.outcome")).not.toBeNull();
    expect(validateNodePath("foo.outcome/../../etc")).not.toBeNull();
    expect(validateNodePath("foo.outcome/..")).not.toBeNull();
  });

  it("GIVEN absolute path WHEN validated THEN rejects", () => {
    expect(validateNodePath("/etc/passwd.outcome")).not.toBeNull();
    expect(validateNodePath("/tmp/foo.enabler")).not.toBeNull();
  });

  it("GIVEN TOML-unsafe characters WHEN validated THEN rejects", () => {
    expect(validateNodePath("foo\"bar.outcome")).not.toBeNull();
    expect(validateNodePath("foo\\bar.outcome")).not.toBeNull();
    expect(validateNodePath("foo\nbar.outcome")).not.toBeNull();
    expect(validateNodePath("foo\tbar.outcome")).not.toBeNull();
    expect(validateNodePath("foo\rbar.outcome")).not.toBeNull();
  });

  it("GIVEN valid node path WHEN validated THEN accepts", () => {
    expect(validateNodePath(FLAT_NODE)).toBeNull();
    expect(validateNodePath(NESTED_NODE)).toBeNull();
  });

  it("PROPERTY: all generated node paths pass validation", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        expect(validateNodePath(node)).toBeNull();
      }),
    );
  });
});

describe("readExcludedNodes filters unsafe paths", () => {
  it("GIVEN EXCLUDE with path traversal WHEN parsed THEN traversal paths are filtered out", () => {
    const content = [
      FLAT_NODE,
      "../etc/passwd.outcome",
      NESTED_NODE,
      "/absolute/path.enabler",
    ].join("\n");

    const nodes = readExcludedNodes(content);
    expect(nodes).toEqual([FLAT_NODE, NESTED_NODE]);
  });

  it("GIVEN EXCLUDE with TOML-unsafe paths WHEN parsed THEN unsafe paths are filtered out", () => {
    const content = [
      FLAT_NODE,
      "inject\"quote.outcome",
      "inject\\slash.enabler",
    ].join("\n");

    const nodes = readExcludedNodes(content);
    expect(nodes).toEqual([FLAT_NODE]);
  });
});

describe("TOML output safety", () => {
  it("PROPERTY: no generated pytest entry contains unescaped TOML string delimiters", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        const entry = toPytestIgnore(node);
        // The entry itself should not contain raw quotes that would break TOML
        expect(entry).not.toContain("\"");
        expect(entry).not.toContain("\\");
      }),
    );
  });

  it("PROPERTY: no generated pyright entry contains TOML string delimiters", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        const entry = toPyrightPath(node);
        expect(entry).not.toContain("\"");
      }),
    );
  });

  it("PROPERTY: mypy regex entries use only TOML-safe characters in string context", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        const entry = toMypyRegex(node);
        // Backslashes from regex escaping are valid in TOML basic strings
        // But raw quotes and newlines would break the TOML string
        expect(entry).not.toContain("\"");
        expect(entry).not.toContain("\n");
      }),
    );
  });
});

describe("malformed TOML resilience", () => {
  it("GIVEN pyproject with unmatched opening bracket WHEN applied THEN returns content unmodified without hanging", () => {
    const malformed = [
      `[${PYTEST_SECTION}]`,
      "addopts = \"--strict-markers\"",
      "",
      `[${MYPY_SECTION}]`,
      "exclude = [",
      "    \"build/\",",
      // Missing closing bracket
      "",
      `[${PYRIGHT_SECTION}]`,
      "exclude = [",
      "    \"build/\",",
      "]",
    ].join("\n");

    // Should terminate and not hang — the bracket matching loop is bounded by content.length
    const result = pythonAdapter.applyExclusions(malformed, [FLAT_NODE]);

    // Pytest addopts still gets updated (independent of broken arrays)
    expect(result.content).toContain(toPytestIgnore(FLAT_NODE));
  });

  it("GIVEN pyproject missing all tool sections WHEN applied THEN returns content unmodified", () => {
    const noSections = "[project]\nname = \"test\"\n";

    const result = pythonAdapter.applyExclusions(noSections, [FLAT_NODE]);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(noSections);
  });

  it("GIVEN empty string as pyproject WHEN applied THEN returns empty string unchanged", () => {
    const result = pythonAdapter.applyExclusions("", [FLAT_NODE]);

    expect(result.changed).toBe(false);
    expect(result.content).toBe("");
  });

  it("PROPERTY: applying to arbitrary strings never throws", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.array(arbitraryNodePath(), { minLength: 0, maxLength: 3 }),
        (content, nodes) => {
          // Must not throw regardless of input
          const result = pythonAdapter.applyExclusions(content, nodes);
          expect(typeof result.content).toBe("string");
          expect(typeof result.changed).toBe("boolean");
        },
      ),
    );
  });
});
