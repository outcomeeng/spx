import { Buffer } from "node:buffer";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveAuditBranchIdentity, slugAuditBranchIdentity } from "@/domains/audit/run-state";
import { sha256Hex, STATE_STORE_BRANCH_IDENTITY, STATE_STORE_BRANCH_SLUG } from "@/lib/state-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";

const hashPrefixHexLength = 8;
const pathSeparatorPattern = /[\\/]/;
const slugCharacterPattern = /^[a-z0-9-]+$/;
const slugSeparator = "-";

function hashPrefix(value: string): string {
  return sha256Hex(value).slice(0, hashPrefixHexLength);
}

describe("audit branch slugging", () => {
  it("normalizes branch names to filesystem-safe slugs with deterministic hash suffixes", () => {
    fc.assert(
      fc.property(AUDIT_RUN_STATE_TEST_GENERATOR.branchNameWithPunctuation(), (branchName) => {
        const slug = slugAuditBranchIdentity(branchName);

        expect(slug).toMatch(slugCharacterPattern);
        expect(slug).not.toMatch(pathSeparatorPattern);
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

  it("keeps only the hash prefix when audit branch normalization produces an empty prefix", () => {
    const branchName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.emptyNormalizedBranchName());

    expect(slugAuditBranchIdentity(branchName)).toBe(hashPrefix(branchName));
  });

  it("respects explicit byte limits shorter than the hash prefix", () => {
    fc.assert(
      fc.property(
        AUDIT_RUN_STATE_TEST_GENERATOR.branchName(),
        fc.integer({ min: 0, max: hashPrefixHexLength - 1 }),
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
    expect(slugAuditBranchIdentity(identity, hashPrefixHexLength)).toMatch(slugCharacterPattern);
  });
});
