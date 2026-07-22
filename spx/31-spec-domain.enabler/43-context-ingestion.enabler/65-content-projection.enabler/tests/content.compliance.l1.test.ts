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
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextCommand,
  methodologyPackageConfig,
  parseContextManifest,
  withRichContextEnv,
  writeMethodologyPackage,
} from "@testing/harnesses/spec/context";

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

  it("never carries content, digest, or byte count on an entry outside the methodology group when the methodology payload is present and content is not requested", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyPackage(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = parseContextManifest(
        await contextCommand({ targets: [target.id], cwd: env.productDir, understand: true }),
      );
      // The boundary is only proven when the methodology group is actually
      // present and body-bearing in the same response.
      expect(manifest.read.find((document) => document.path === fixture.corePath)?.content)
        .toBe(fixture.coreText);
      for (const document of manifest.read) {
        if (document.path === fixture.corePath) continue;
        for (const field of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(document).not.toHaveProperty(field);
        }
      }
      for (const entry of manifest.listed) {
        for (const field of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(entry).not.toHaveProperty(field);
        }
      }
    });
  });
});
