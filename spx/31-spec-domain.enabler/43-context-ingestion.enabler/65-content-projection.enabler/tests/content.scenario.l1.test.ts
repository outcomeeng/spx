import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatInvalidContextDocumentError, formatUnreadableContextDocumentError } from "@/lib/spec-tree";
import { arbitrarySpecContextInvalidUtf8Bytes } from "@testing/generators/spec-tree/context-target";
import { sampleSpecTreeTestValue } from "@testing/generators/spec-tree/spec-tree";
import { contextCommand, parseContextManifest, readPaths, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context document content", () => {
  it("fails naming the exact path when a read document is not valid UTF-8", async () => {
    await withRichContextEnv(async (env, paths) => {
      await writeFile(
        join(env.productDir, paths.ancestorPlanPath),
        Buffer.from(sampleSpecTreeTestValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
      await expect(
        contextCommand({ targets: [paths.targetId], cwd: env.productDir, content: true }),
      ).rejects.toThrow(formatInvalidContextDocumentError(paths.ancestorPlanPath));
    });
    // A citation-scanned structural document fails with the same exact-path
    // diagnostic — never a missing-citation error over mangled bytes and never
    // a raw filesystem error.
    await withRichContextEnv(async (env, paths) => {
      await writeFile(
        join(env.productDir, paths.targetSpecPath),
        Buffer.from(sampleSpecTreeTestValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
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
});
