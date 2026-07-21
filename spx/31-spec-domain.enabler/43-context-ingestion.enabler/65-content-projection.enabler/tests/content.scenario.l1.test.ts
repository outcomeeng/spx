import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  decodeContextDocumentUtf8,
  formatInvalidContextDocumentError,
  formatUnreadableContextDocumentError,
  SPEC_CONTEXT_CONTENT_FIELDS,
  SPEC_CONTEXT_DIGEST_ALGORITHM,
  specContextDigest,
} from "@/lib/spec-tree";
import { contextCommand, parseContextManifest, readPaths, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context document content", () => {
  it("carries every read document's exact content, digest, and byte count when content is requested", async () => {
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

  it("fails naming the exact path when a read document is not valid UTF-8", async () => {
    await withRichContextEnv(async (env, paths) => {
      await writeFile(join(env.productDir, paths.ancestorPlanPath), Buffer.from([0xff, 0xfe, 0xfd]));
      await expect(
        contextCommand({ targets: [paths.targetId], cwd: env.productDir, content: true }),
      ).rejects.toThrow(formatInvalidContextDocumentError(paths.ancestorPlanPath));
    });
    // A citation-scanned structural document fails with the same exact-path
    // diagnostic — never a missing-citation error over mangled bytes and never
    // a raw filesystem error.
    await withRichContextEnv(async (env, paths) => {
      await writeFile(join(env.productDir, paths.targetSpecPath), Buffer.from([0xff, 0xfe, 0xfd]));
      await expect(
        contextCommand({ targets: [paths.targetId], cwd: env.productDir, content: true }),
      ).rejects.toThrow(formatInvalidContextDocumentError(paths.targetSpecPath));
    });
  });

  it("fails naming the exact path when a read document cannot be read", async () => {
    await withRichContextEnv(async (env, paths) => {
      // Removing every permission bit makes the read fail on POSIX non-root
      // runners; restored afterwards so temp-directory cleanup stays quiet.
      await chmod(join(env.productDir, paths.ancestorPlanPath), 0o000);
      try {
        await expect(
          contextCommand({ targets: [paths.targetId], cwd: env.productDir, content: true }),
        ).rejects.toThrow(formatUnreadableContextDocumentError(paths.ancestorPlanPath));
      } finally {
        await chmod(join(env.productDir, paths.ancestorPlanPath), 0o644);
      }
    });
  });

  it("keeps an unreadable citation-scanned document as a read entry when content is not requested", async () => {
    await withRichContextEnv(async (env, paths) => {
      // Removing every permission bit makes the read fail on POSIX non-root
      // runners; restored afterwards so temp-directory cleanup stays quiet.
      await chmod(join(env.productDir, paths.targetSpecPath), 0o000);
      try {
        const manifest = parseContextManifest(
          await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
        );
        expect(readPaths(manifest)).toContain(paths.targetSpecPath);
      } finally {
        await chmod(join(env.productDir, paths.targetSpecPath), 0o644);
      }
    });
  });

  it("omits content fields from every entry when content is not requested", async () => {
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
