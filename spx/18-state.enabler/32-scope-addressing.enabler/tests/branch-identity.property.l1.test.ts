import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";
import { posix, win32 } from "node:path";
import { TextEncoder } from "node:util";

import { describe, expect, it } from "vitest";

import { slugBranchIdentity, STATE_STORE_BRANCH_SLUG, validateBranchSlug } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { WEB_CRYPTO_SHA256_ALGORITHM } from "@testing/harnesses/crypto";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

async function hashPrefix(value: string): Promise<string> {
  const digest = await webcrypto.subtle.digest(WEB_CRYPTO_SHA256_ALGORITHM, new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex").slice(0, STATE_STORE_BRANCH_SLUG.HASH_PREFIX_HEX_LENGTH);
}

describe("state-store branch identity", () => {
  it("slugs every branch identity deterministically into a path-separator-free, byte-bounded, hash-suffixed slug", async () => {
    await assertProperty(
      STATE_STORE_TEST_GENERATOR.anyBranchIdentity(),
      async (branchIdentity) => {
        const slug = slugBranchIdentity(branchIdentity);

        expect(slugBranchIdentity(branchIdentity)).toBe(slug);
        expect(slug.includes(posix.sep)).toBe(false);
        expect(slug.includes(win32.sep)).toBe(false);
        expect(validateBranchSlug(slug)).toEqual({ ok: true, value: slug });
        expect(Buffer.byteLength(slug)).toBeLessThanOrEqual(STATE_STORE_BRANCH_SLUG.DEFAULT_MAX_BYTES);
        expect(slug.endsWith(await hashPrefix(branchIdentity))).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
