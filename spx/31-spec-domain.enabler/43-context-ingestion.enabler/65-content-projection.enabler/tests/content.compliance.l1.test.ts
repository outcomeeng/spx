import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  decodeContextDocumentUtf8,
  SPEC_CONTEXT_CONTENT_FIELDS,
  SPEC_CONTEXT_DIGEST_ALGORITHM,
  specContextDigest,
} from "@/lib/spec-tree";
import { contextCommand, parseContextManifest, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context content-field boundary", () => {
  it("always carries exact content, an algorithm-named raw-byte digest, and a byte count on every read entry and never on a listed entry when content is requested", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir, content: true }),
      );
      expect(manifest.read.length).toBeGreaterThan(0);
      // The written string is the encoding-independent oracle: a wrong-encoding
      // decode reproduces ASCII documents byte-for-byte but not the multi-byte
      // characters, and a BOM-stripping decode drops the leading U+FEFF.
      expect(
        manifest.read.find((document) => document.path === paths.targetIssuesPath)?.content,
      ).toBe(paths.targetIssuesText);
      for (const document of manifest.read) {
        const rawBytes = await readFile(join(env.productDir, document.path));
        expect(document.content).toBe(decodeContextDocumentUtf8(rawBytes));
        expect(document.digest).toBe(specContextDigest(rawBytes));
        expect(document.digest).toBe(
          `${SPEC_CONTEXT_DIGEST_ALGORITHM}:${
            createHash(SPEC_CONTEXT_DIGEST_ALGORITHM).update(rawBytes).digest("hex")
          }`,
        );
        expect(document.bytes).toBe(rawBytes.byteLength);
      }
      for (const entry of manifest.listed) {
        for (const field of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(entry).not.toHaveProperty(field);
        }
      }
    });
  });

  it("never carries content, digest, or byte count on any entry when content is not requested", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
      );
      for (const document of [...manifest.read, ...manifest.listed]) {
        for (const field of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(document).not.toHaveProperty(field);
        }
      }
    });
  });
});
