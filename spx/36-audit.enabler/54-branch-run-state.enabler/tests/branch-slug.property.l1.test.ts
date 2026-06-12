import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveAuditBranchIdentity, slugAuditBranchIdentity } from "@/domains/audit/run-state";
import { STATE_STORE_BRANCH_IDENTITY, STATE_STORE_BRANCH_SLUG } from "@/lib/state-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";

const SHA256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";
const HASH_PREFIX_HEX_LENGTH = 8;
const PATH_SEPARATOR_PATTERN = /[\\/]/;
const SLUG_CHARACTER_PATTERN = /^[a-z0-9-]+$/;
const SLUG_SEPARATOR = "-";

function hashPrefix(value: string): string {
  return createHash(SHA256_ALGORITHM).update(value).digest(HEX_ENCODING).slice(0, HASH_PREFIX_HEX_LENGTH);
}

describe("audit branch slugging", () => {
  it("normalizes branch names to filesystem-safe slugs with deterministic hash suffixes", () => {
    fc.assert(
      fc.property(AUDIT_RUN_STATE_TEST_GENERATOR.branchNameWithPunctuation(), (branchName) => {
        const slug = slugAuditBranchIdentity(branchName);

        expect(slug).toMatch(SLUG_CHARACTER_PATTERN);
        expect(slug).not.toMatch(PATH_SEPARATOR_PATTERN);
        expect(slug.endsWith(hashPrefix(branchName))).toBe(true);
      }),
    );
  });

  it("preserves the hash suffix while respecting the default byte limit", () => {
    fc.assert(
      fc.property(AUDIT_RUN_STATE_TEST_GENERATOR.branchName(), (branchName) => {
        const slug = slugAuditBranchIdentity(branchName);

        expect(Buffer.byteLength(slug)).toBeLessThanOrEqual(STATE_STORE_BRANCH_SLUG.DEFAULT_MAX_BYTES);
        expect(slug.endsWith(hashPrefix(branchName))).toBe(true);
      }),
    );
  });

  it("uses the hash prefix alone when normalization produces an empty branch prefix", () => {
    const branchName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.emptyNormalizedBranchName());

    expect(slugAuditBranchIdentity(branchName)).toBe(hashPrefix(branchName));
  });

  it("respects explicit byte limits shorter than the hash prefix", () => {
    fc.assert(
      fc.property(
        AUDIT_RUN_STATE_TEST_GENERATOR.branchName(),
        fc.integer({ min: 0, max: HASH_PREFIX_HEX_LENGTH - 1 }),
        (branchName, maxBytes) => {
          const slug = slugAuditBranchIdentity(branchName, maxBytes);

          expect(Buffer.byteLength(slug)).toBeLessThanOrEqual(maxBytes);
          expect(slug).toBe(hashPrefix(branchName).slice(0, maxBytes));
        },
      ),
    );
  });

  it("trims truncated prefixes before appending the hash suffix", () => {
    const left = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchNameSegment());
    const right = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchNameSegment());
    const branchName = `${left}/${right}`;
    const hash = hashPrefix(branchName);
    const maxBytes = left.length + SLUG_SEPARATOR.length + hash.length + SLUG_SEPARATOR.length;
    const slug = slugAuditBranchIdentity(branchName, maxBytes);

    expect(slug).not.toContain("--");
    expect(slug.endsWith(hash)).toBe(true);
  });

  it("resolves detached HEAD identity from the head SHA before slugging", () => {
    const headSha = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.headSha());
    const identity = resolveAuditBranchIdentity({ headSha });

    expect(identity).toBe(
      `${STATE_STORE_BRANCH_IDENTITY.DETACHED_HEAD_PREFIX}-${headSha.slice(
        0,
        STATE_STORE_BRANCH_IDENTITY.DETACHED_HEAD_SHA_HEX_LENGTH,
      )}`,
    );
    expect(slugAuditBranchIdentity(identity, HASH_PREFIX_HEX_LENGTH)).toMatch(SLUG_CHARACTER_PATTERN);
  });
});
