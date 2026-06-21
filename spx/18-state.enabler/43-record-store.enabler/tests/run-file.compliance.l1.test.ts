import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createJsonlRunFile,
  createStateStoreRunToken,
  runFileName,
  STATE_STORE_DOMAIN,
  STATE_STORE_ERROR,
  STATE_STORE_PATH,
  STATE_STORE_TEXT_ENCODING,
} from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

describe("record store run-file symlink safety", () => {
  it("never writes a run file through a path that already resolves to a symbolic link", async () => {
    const date = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runDate());
    const runBytes = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runIdBytes());

    await withTempDir("spx-record-store-symlink-", async (scopeDir) => {
      // The run token is a pure function of the injected clock and bytes, so every
      // create attempt targets this exact path. Plant a symbolic link there pointing
      // at a real file whose content a write-through the link would clobber.
      const token = createStateStoreRunToken({ date, randomBytes: () => runBytes });
      const runsDir = join(scopeDir, STATE_STORE_DOMAIN.TEST, STATE_STORE_PATH.RUNS_DIR);
      const runFilePath = join(runsDir, runFileName(token.runToken));
      const redirectTarget = join(scopeDir, "record-store-redirect-target.jsonl");
      const targetContent = `${JSON.stringify({ planted: true })}\n`;
      await writeFile(redirectTarget, targetContent, STATE_STORE_TEXT_ENCODING);
      await mkdir(dirname(runFilePath), { recursive: true });
      await symlink(redirectTarget, runFilePath);

      // Constant clock and bytes make every attempt collide with the planted link,
      // so the exclusive-create flag fails each open and the create exhausts its
      // retries rather than ever writing through the link to its target.
      const created = await createJsonlRunFile(scopeDir, STATE_STORE_DOMAIN.TEST, {
        now: () => date,
        randomBytes: () => runBytes,
      });

      expect(created).toEqual({ ok: false, error: STATE_STORE_ERROR.RUN_FILE_COLLISION_LIMIT });
      // The link target is untouched — the exclusive create never wrote through it.
      await expect(readFile(redirectTarget, STATE_STORE_TEXT_ENCODING)).resolves.toBe(targetContent);
    });
  });
});
