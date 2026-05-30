import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

describe("withTempDir — lifecycle", () => {
  it("creates a fresh directory under os.tmpdir() and passes it to the callback", async () => {
    const prefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());
    let observed = "";

    await withTempDir(prefix, async (dir) => {
      observed = dir;
      const info = await stat(dir);
      expect(info.isDirectory()).toBe(true);
      expect(resolve(dir).startsWith(resolve(tmpdir()) + sep)).toBe(true);
    });

    expect(resolve(observed).startsWith(resolve(tmpdir()) + sep)).toBe(true);
  });

  it("returns the callback's result unchanged", async () => {
    const prefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());
    const payload = sampleLiteralTestValue(arbitraryDomainLiteral());

    const result = await withTempDir(prefix, async () => payload);

    expect(result).toBe(payload);
  });

  it("removes the directory after the callback returns", async () => {
    const prefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());
    let observed = "";

    await withTempDir(prefix, async (dir) => {
      observed = dir;
      expect(existsSync(dir)).toBe(true);
    });

    expect(existsSync(observed)).toBe(false);
  });

  it("returns distinct directories on repeated invocations", async () => {
    const prefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());
    const observed: string[] = [];

    await withTempDir(prefix, async (dir) => {
      observed.push(dir);
    });
    await withTempDir(prefix, async (dir) => {
      observed.push(dir);
    });

    expect(observed[0]).not.toBe(observed[1]);
  });
});

describe("withTempDir — cleanup on throw", () => {
  class TempDirBoomError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "TempDirBoomError";
    }
  }

  it("removes the directory when the callback throws and rethrows the original error", async () => {
    const prefix = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix());
    let observed = "";
    const boom = new TempDirBoomError(sampleLiteralTestValue(arbitraryDomainLiteral()));

    await expect(
      withTempDir(prefix, async (dir) => {
        observed = dir;
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(existsSync(observed)).toBe(false);
  });
});
