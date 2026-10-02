import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  resolveBranchIdentity,
  slugBranchIdentity,
  STATE_STORE_BRANCH_IDENTITY,
  STATE_STORE_BRANCH_SLUG,
  validateBranchSlug,
} from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { WEB_CRYPTO_SHA256_ALGORITHM } from "@testing/harnesses/crypto";

async function hashPrefix(value: string): Promise<string> {
  const digest = await webcrypto.subtle.digest(WEB_CRYPTO_SHA256_ALGORITHM, new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex").slice(0, STATE_STORE_BRANCH_SLUG.HASH_PREFIX_HEX_LENGTH);
}

describe("state-store branch identity", () => {
  it("normalizes branch identities to filesystem-safe slugs with deterministic hash suffixes", async () => {
    await fc.assert(
      fc.asyncProperty(STATE_STORE_TEST_GENERATOR.branchIdentity(), async (branchIdentity) => {
        const slug = slugBranchIdentity(branchIdentity);

        expect(validateBranchSlug(slug)).toEqual({ ok: true, value: slug });
        expect(slugBranchIdentity(branchIdentity)).toBe(slug);
        expect(slug.endsWith(await hashPrefix(branchIdentity))).toBe(true);
      }),
    );
  });

  it("preserves the hash suffix while respecting configured byte limits", async () => {
    await fc.assert(
      fc.asyncProperty(
        STATE_STORE_TEST_GENERATOR.branchIdentity(),
        fc.integer({ min: 9, max: 120 }),
        async (branchIdentity, maxBytes) => {
          const slug = slugBranchIdentity(branchIdentity, maxBytes);

          expect(Buffer.byteLength(slug)).toBeLessThanOrEqual(maxBytes);
          expect(slug.endsWith(await hashPrefix(branchIdentity))).toBe(true);
        },
      ),
    );
  });

  it("uses the hash prefix alone when normalization produces an empty branch prefix", async () => {
    const branchIdentity = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.emptyNormalizedBranchIdentity());

    expect(slugBranchIdentity(branchIdentity)).toBe(await hashPrefix(branchIdentity));
  });

  it("resolves detached HEAD identity from the head SHA before slugging", () => {
    const headSha = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.headSha());
    const identity = resolveBranchIdentity({ headSha });

    expect(identity).toBe(
      `${STATE_STORE_BRANCH_IDENTITY.DETACHED_HEAD_PREFIX}-${
        headSha.slice(0, STATE_STORE_BRANCH_IDENTITY.DETACHED_HEAD_SHA_HEX_LENGTH)
      }`,
    );
    expect(validateBranchSlug(slugBranchIdentity(identity))).toEqual({ ok: true, value: slugBranchIdentity(identity) });
  });
});
