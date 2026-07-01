import { createHash, webcrypto } from "node:crypto";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { WEB_CRYPTO_SHA256_ALGORITHM } from "@testing/harnesses/crypto";

describe("crypto test harness compliance", () => {
  it("uses a shared digest token accepted by Web Crypto and Node hashing", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array(), async (bytes) => {
        const webDigest = Buffer.from(await webcrypto.subtle.digest(WEB_CRYPTO_SHA256_ALGORITHM, bytes));
        const nodeDigest = createHash(WEB_CRYPTO_SHA256_ALGORITHM.toLowerCase().replace(/-/gu, ""))
          .update(bytes)
          .digest();

        expect(webDigest).toEqual(nodeDigest);
      }),
    );
  });
});
