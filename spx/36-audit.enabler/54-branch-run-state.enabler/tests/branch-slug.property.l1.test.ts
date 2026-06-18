import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveAuditBranchIdentity, slugAuditBranchIdentity } from "@/domains/audit/run-state";
import { STATE_STORE_BRANCH_IDENTITY, STATE_STORE_BRANCH_SLUG } from "@/lib/state-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { WEB_CRYPTO_SHA256_ALGORITHM } from "@testing/harnesses/crypto";

const pathSeparatorPattern = /[\\/]/;
const slugCharacterPattern = /^[a-z0-9-]+$/;
const slugSeparator = "-";

async function hashPrefix(value: string): Promise<string> {
  const digest = await webcrypto.subtle.digest(WEB_CRYPTO_SHA256_ALGORITHM, new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex").slice(0, STATE_STORE_BRANCH_SLUG.HASH_PREFIX_HEX_LENGTH);
}

describe("audit branch slugging", () => {
  it("normalizes branch names to filesystem-safe slugs with deterministic hash suffixes", async () => {
    await fc.assert(
      fc.asyncProperty(AUDIT_RUN_STATE_TEST_GENERATOR.branchNameWithPunctuation(), async (branchName) => {
        const slug = slugAuditBranchIdentity(branchName);

        expect(slug).toMatch(slugCharacterPattern);
        expect(slug).not.toMatch(pathSeparatorPattern);
        expect(slug.endsWith(await hashPrefix(branchName))).toBe(true);
      }),
    );
  });

  it("preserves the hash suffix while respecting the default byte limit", async () => {
    await fc.assert(
      fc.asyncProperty(AUDIT_RUN_STATE_TEST_GENERATOR.branchName(), async (branchName) => {
        const slug = slugAuditBranchIdentity(branchName);

        expect(Buffer.byteLength(slug)).toBeLessThanOrEqual(STATE_STORE_BRANCH_SLUG.DEFAULT_MAX_BYTES);
        expect(slug.endsWith(await hashPrefix(branchName))).toBe(true);
      }),
    );
  });

  it("keeps only the hash prefix when audit branch normalization produces an empty prefix", async () => {
    const branchName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.emptyNormalizedBranchName());

    expect(slugAuditBranchIdentity(branchName)).toBe(await hashPrefix(branchName));
  });

  it("respects explicit byte limits shorter than the hash prefix", async () => {
    await fc.assert(
      fc.asyncProperty(
        AUDIT_RUN_STATE_TEST_GENERATOR.branchName(),
        fc.integer({ min: 0, max: STATE_STORE_BRANCH_SLUG.HASH_PREFIX_HEX_LENGTH - 1 }),
        async (branchName, maxBytes) => {
          const slug = slugAuditBranchIdentity(branchName, maxBytes);

          expect(Buffer.byteLength(slug)).toBeLessThanOrEqual(maxBytes);
          expect(slug).toBe((await hashPrefix(branchName)).slice(0, maxBytes));
        },
      ),
    );
  });

  it("trims truncated prefixes before appending the hash suffix", async () => {
    const left = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchNameSegment());
    const right = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchNameSegment());
    const branchName = `${left}/${right}`;
    const hash = await hashPrefix(branchName);
    const maxBytes = left.length + slugSeparator.length + hash.length + slugSeparator.length;
    const slug = slugAuditBranchIdentity(branchName, maxBytes);

    expect(slug).not.toContain(`${slugSeparator}${slugSeparator}`);
    expect(slug.endsWith(hash)).toBe(true);
  });

  it("resolves audit detached HEAD identity from the head SHA before slugging", () => {
    const headSha = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.headSha());
    const identity = resolveAuditBranchIdentity({ headSha });

    expect(identity).toBe(
      `${STATE_STORE_BRANCH_IDENTITY.DETACHED_HEAD_PREFIX}-${headSha.slice(
        0,
        STATE_STORE_BRANCH_IDENTITY.DETACHED_HEAD_SHA_HEX_LENGTH,
      )}`,
    );
    expect(slugAuditBranchIdentity(identity, STATE_STORE_BRANCH_SLUG.HASH_PREFIX_HEX_LENGTH)).toMatch(slugCharacterPattern);
  });
});
