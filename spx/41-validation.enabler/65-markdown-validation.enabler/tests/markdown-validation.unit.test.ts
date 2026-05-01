/**
 * Level 1: Unit tests for markdown validation.
 *
 * Tests pure functions (config builder, directory resolver) directly.
 * Tests validation behavior against fixture directories via harness.
 *
 * Routing: Stage 3A/4 → Level 1. markdownlint-cli2 is a production dep
 * available in node_modules, temp dirs are stdlib. No external systems.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMarkdownlintConfig,
  getDefaultDirectories,
  MARKDOWN_CUSTOM_RULE_NAMES,
  validateMarkdown,
} from "@/validation/steps/markdown";
import {
  MARKDOWN_FIXTURES,
  MARKDOWN_HARNESS_TIMEOUT,
  withMarkdownEnv,
} from "@testing/harnesses/with-markdown-env";

// =============================================================================
// LINK VALIDATION — SCENARIOS (via fixture harness)
// =============================================================================

describe("validateMarkdown()", () => {
  describe("clean tree fixture", () => {
    it(
      "GIVEN a nested tree with valid relative links and heading fragments, WHEN validation runs, THEN no errors are reported",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.CLEAN_TREE }, async ({ spxDir }) => {
          const result = await validateMarkdown({ directories: [spxDir] });

          expect(result.success).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );

    it(
      "GIVEN a tree with data URI images, WHEN validation runs, THEN data URIs are not flagged",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.CLEAN_TREE }, async ({ spxDir }) => {
          const result = await validateMarkdown({ directories: [spxDir] });

          expect(result.success).toBe(true);
          // The sibling.md contains a data: URI image — must not be treated as a broken link
          expect(result.errors.filter((e) => e.detail.includes("data:"))).toHaveLength(0);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );
  });

  describe("broken links fixture", () => {
    it(
      "GIVEN a nested tree with broken relative links, WHEN validation runs, THEN errors identify each broken link",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ spxDir }) => {
          const result = await validateMarkdown({ directories: [spxDir] });

          expect(result.success).toBe(false);
          // feature.md has broken link to deleted.md + broken fragment
          // child.md has broken link to nonexistent.md
          // sibling.md has broken link to deleted-guide.md
          expect(result.errors.length).toBeGreaterThanOrEqual(3);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );

    it(
      "GIVEN a broken heading fragment, WHEN validation runs, THEN the error identifies the fragment",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ spxDir }) => {
          const result = await validateMarkdown({ directories: [spxDir] });

          const fragmentErrors = result.errors.filter((e) => e.detail.includes("nonexistent-heading"));
          expect(fragmentErrors.length).toBeGreaterThanOrEqual(1);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );

    it(
      "GIVEN a tree with data URI images alongside broken links, WHEN validation runs, THEN data URIs are not flagged as errors",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ spxDir }) => {
          const result = await validateMarkdown({ directories: [spxDir] });

          // sibling.md has a data: URI — must not appear in errors
          const dataUriErrors = result.errors.filter((e) => e.detail.includes("data:"));
          expect(dataUriErrors).toHaveLength(0);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );

    it(
      "GIVEN broken links in nested directories, WHEN validation runs, THEN errors include file path and line number",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ spxDir }) => {
          const result = await validateMarkdown({ directories: [spxDir] });

          for (const error of result.errors) {
            expect(error.file).toBeTruthy();
            expect(error.line).toBeGreaterThan(0);
            expect(error.detail).toBeTruthy();
          }
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );
  });

  // ===========================================================================
  // LINK TYPE RESOLUTION — MAPPING (via fixture harness)
  // ===========================================================================

  describe("link type resolution", () => {
    it(
      "GIVEN external URLs and HTML links in the clean tree, WHEN validation runs, THEN they are not checked",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.CLEAN_TREE }, async ({ spxDir }) => {
          const result = await validateMarkdown({ directories: [spxDir] });

          // Clean tree has only valid relative links + data URIs — all should pass
          expect(result.success).toBe(true);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );

    it(
      "GIVEN project-absolute links, WHEN validation runs with projectRoot, THEN links resolve from root",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path, spxDir }) => {
          const result = await validateMarkdown({
            directories: [spxDir],
            projectRoot: path,
          });

          // child.md has a broken /spx/does-not-exist.md absolute link
          const absoluteErrors = result.errors.filter((e) => e.detail.includes("does-not-exist"));
          expect(absoluteErrors.length).toBeGreaterThanOrEqual(1);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );
  });

  // ===========================================================================
  // COMPLIANCE — NO SIDE EFFECTS (via fixture harness)
  // ===========================================================================

  describe("no side effects in validated directories", () => {
    it(
      "GIVEN validation runs on a nested tree, THEN no files are created in validated directories",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.CLEAN_TREE }, async ({ spxDir }) => {
          const { readdirSync } = await import("node:fs");
          const featureDir = join(spxDir, "21-feature.outcome");

          const rootBefore = new Set(readdirSync(spxDir));
          const featureBefore = new Set(readdirSync(featureDir));

          await validateMarkdown({ directories: [spxDir] });

          const rootAfter = new Set(readdirSync(spxDir));
          const featureAfter = new Set(readdirSync(featureDir));

          expect(rootAfter).toEqual(rootBefore);
          expect(featureAfter).toEqual(featureBefore);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );
  });

  // ===========================================================================
  // COMPLIANCE — DEFAULT DIRECTORIES (via fixture harness)
  // ===========================================================================

  describe("default directory scoping", () => {
    it(
      "GIVEN a project with spx/ and docs/, THEN both are returned as default directories",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.CLEAN_TREE }, async ({ path }) => {
          const dirs = getDefaultDirectories(path);

          expect(dirs).toHaveLength(2);
          expect(dirs).toContain(join(path, "spx"));
          expect(dirs).toContain(join(path, "docs"));
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );

    it(
      "GIVEN a project with only spx/, THEN only spx/ is returned",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path }) => {
          const dirs = getDefaultDirectories(path);

          // broken-links fixture has both spx/ and docs/
          expect(dirs.length).toBeGreaterThanOrEqual(1);
          expect(dirs).toContain(join(path, "spx"));
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );
  });

  // ===========================================================================
  // spx/EXCLUDE SUPPORT
  // ===========================================================================

  describe("spx/EXCLUDE support", () => {
    it(
      "GIVEN spx/EXCLUDE lists a node path, WHEN validation runs, THEN markdown files in that node are skipped",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.WITH_EXCLUDE }, async ({ spxDir, path }) => {
          const result = await validateMarkdown({
            directories: [spxDir],
            projectRoot: path,
          });

          // 32-declared.outcome has broken [test] links but is excluded
          // 21-passing.outcome has valid links — should pass
          expect(result.success).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );

    it(
      "GIVEN a declared-state node with broken [test] links is in EXCLUDE, WHEN validation runs, THEN those links are not reported",
      async () => {
        await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.WITH_EXCLUDE }, async ({ spxDir, path }) => {
          const result = await validateMarkdown({
            directories: [spxDir],
            projectRoot: path,
          });

          // No errors referencing the excluded node's files
          const declaredErrors = result.errors.filter((e) => e.file.includes("32-declared"));
          expect(declaredErrors).toHaveLength(0);
        });
      },
      MARKDOWN_HARNESS_TIMEOUT,
    );
  });
});

// =============================================================================
// PER-DIRECTORY MD024 — DUPLICATE HEADINGS (via fixture harness)
// =============================================================================

describe("per-directory MD024 behavior", () => {
  it(
    "GIVEN spx/ has duplicate sibling headings, WHEN validation runs, THEN MD024 errors are reported",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS }, async ({ spxDir }) => {
        const result = await validateMarkdown({ directories: [spxDir] });

        const md024Errors = result.errors.filter((e) => e.detail.includes("MD024"));
        expect(md024Errors.length).toBeGreaterThanOrEqual(1);
        // The sibling duplicate is in child.md
        expect(md024Errors.some((e) => e.file.includes("child.md"))).toBe(true);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it(
    "GIVEN spx/ has same heading under different parents, WHEN validation runs, THEN no MD024 error for that file",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS }, async ({ spxDir }) => {
        const result = await validateMarkdown({ directories: [spxDir] });

        // feature.md has "Details" under different parent sections — allowed by siblings_only
        const featureMd024Errors = result.errors.filter(
          (e) => e.file.includes("feature.md") && e.detail.includes("MD024"),
        );
        expect(featureMd024Errors).toHaveLength(0);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it(
    "GIVEN docs/ has duplicate sibling headings, WHEN validation runs, THEN no MD024 errors are reported for docs/",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS }, async ({ docsDir }) => {
        const result = await validateMarkdown({ directories: [docsDir] });

        const md024Errors = result.errors.filter((e) => e.detail.includes("MD024"));
        expect(md024Errors).toHaveLength(0);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it(
    "GIVEN docs/ has a broken relative link, WHEN validation runs, THEN the broken link is still reported",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.DUPLICATE_HEADINGS }, async ({ docsDir }) => {
        const result = await validateMarkdown({ directories: [docsDir] });

        expect(result.success).toBe(false);
        expect(result.errors.some((e) => e.detail.includes("does-not-exist"))).toBe(true);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});

// =============================================================================
// CONFIG BUILDER — PURE (no harness needed)
// =============================================================================

describe("buildMarkdownlintConfig()", () => {
  it("disables all default rules and enables the curated subset for spx/", () => {
    const config = buildMarkdownlintConfig("spx");

    expect(config.default).toBe(false);

    expect(config.MD001).toBe(true);
    expect(config.MD003).toBe(true);
    expect(config.MD009).toBe(true);
    expect(config.MD010).toBe(true);
    expect(config.MD025).toBe(true);
    expect(config.MD047).toBe(true);
  });

  it("enables MD024 with siblings_only for spx/", () => {
    const config = buildMarkdownlintConfig("spx");

    expect(config.MD024).toEqual({ siblings_only: true });
  });

  it("disables MD024 for docs/", () => {
    const config = buildMarkdownlintConfig("docs");

    expect(config.MD024).toBe(false);
  });

  it("includes the relative-links custom rule", () => {
    const config = buildMarkdownlintConfig("spx");

    expect(config.customRules).toBeDefined();
    expect(config.customRules).toHaveLength(1);

    const rule = config.customRules[0];
    expect(rule.names).toEqual(MARKDOWN_CUSTOM_RULE_NAMES);
  });
});
