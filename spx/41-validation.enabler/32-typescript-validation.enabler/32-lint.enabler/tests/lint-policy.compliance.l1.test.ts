import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateLintPolicy } from "@/validation/lint-policy";
import { LINT_POLICY_MANIFESTS } from "@/validation/lint-policy-constants";

const LEGACY_MANIFEST_FILE = LINT_POLICY_MANIFESTS.LEGACY_SPEC_SUFFIX_NODES.file;
const LEGACY_MANIFEST_KEY = LINT_POLICY_MANIFESTS.LEGACY_SPEC_SUFFIX_NODES.key;
const TEST_DEBT_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.file;
const TEST_DEBT_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.key;

async function withPolicyProject(callback: (projectRoot: string) => Promise<void>): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), "spx-lint-policy-"));
  try {
    await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function writePolicyManifest(
  projectRoot: string,
  entries: {
    readonly legacySpecSuffixNodes: readonly string[];
    readonly testLintDebtNodes: readonly string[];
  },
): Promise<void> {
  await writeFile(
    join(projectRoot, LEGACY_MANIFEST_FILE),
    JSON.stringify({ [LEGACY_MANIFEST_KEY]: entries.legacySpecSuffixNodes }, null, 2),
  );
  await writeFile(
    join(projectRoot, TEST_DEBT_MANIFEST_FILE),
    JSON.stringify({ [TEST_DEBT_MANIFEST_KEY]: entries.testLintDebtNodes }, null, 2),
  );
}

describe("lint policy validation", () => {
  it("does not require repository policy manifests in unrelated TypeScript projects", async () => {
    await withPolicyProject(async (projectRoot) => {
      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(true);
    });
  });

  it("accepts manifests that describe existing repository debt without requiring git metadata", async () => {
    await withPolicyProject(async (projectRoot) => {
      await mkdir(join(projectRoot, "spx/10-old.story"), { recursive: true });
      await mkdir(join(projectRoot, "spx/20-current.enabler"), { recursive: true });
      await writePolicyManifest(projectRoot, {
        legacySpecSuffixNodes: ["spx/10-old.story"],
        testLintDebtNodes: ["spx/20-current.enabler"],
      });

      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(true);
    });
  });

  it("rejects legacy suffix nodes that are present in the tree but absent from the manifest", async () => {
    await withPolicyProject(async (projectRoot) => {
      await mkdir(join(projectRoot, "spx/10-old.story"), { recursive: true });
      await writePolicyManifest(projectRoot, {
        legacySpecSuffixNodes: [],
        testLintDebtNodes: [],
      });

      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(LEGACY_MANIFEST_FILE);
      }
    });
  });
});
