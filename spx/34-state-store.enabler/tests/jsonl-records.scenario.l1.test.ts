import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { appendJsonlRecord, readLatestJsonlRecord } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR, sampleStateStoreTestValue } from "@testing/generators/state-store/state-store";
import { removeTempDir } from "@testing/harnesses/with-temp-dir";

describe("state-store JSONL records", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => removeTempDir(dir)));
  });

  async function createTempFile(): Promise<string> {
    const tempPrefix = `${sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken())}-`;
    const dir = await mkdtemp(join(tmpdir(), tempPrefix));
    tempDirs.push(dir);
    return join(dir, "records.jsonl");
  }

  it("appends records and reads the latest record", async () => {
    const [firstRecord, secondRecord] = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.jsonRecordPair());
    const filePath = await createTempFile();

    expect(await appendJsonlRecord(filePath, firstRecord)).toEqual({ ok: true, value: filePath });
    expect(await appendJsonlRecord(filePath, secondRecord)).toEqual({ ok: true, value: filePath });

    expect(await readLatestJsonlRecord(filePath)).toEqual({ ok: true, value: secondRecord });
  });

  it("ignores blank trailing lines and malformed latest lines", async () => {
    const [firstRecord] = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.jsonRecordPair());
    const filePath = await createTempFile();
    await writeFile(filePath, `${JSON.stringify(firstRecord)}\nnot-json\n\n`);

    expect(await readLatestJsonlRecord(filePath)).toEqual({ ok: true, value: firstRecord });
  });

  it("returns undefined when the file is absent", async () => {
    const filePath = await createTempFile();

    expect(await readLatestJsonlRecord(`${filePath}.missing`)).toEqual({ ok: true, value: undefined });
  });
});
