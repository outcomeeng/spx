import { existsSync } from "node:fs";
import { join as joinPath } from "node:path";

import { describe, expect, it } from "vitest";

import { literalCommand } from "@/commands/validation/literal";
import type { Config } from "@/config/types";
import { detectTypeScript } from "@/validation/discovery/index";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { parseLiteralReuseResult } from "@/validation/literal/index";
import {
  LITERAL_TEST_GENERATOR,
  type LiteralReuseFixtureInputs,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

const EMPTY_CONFIG: Config = {};

describe("withLiteralFixtureEnv", () => {
  it("materializes a temp project and provides projectDir to the callback", async () => {
    let captured = "";
    await withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
      captured = env.projectDir;
      expect(existsSync(env.projectDir)).toBe(true);
    });
    expect(captured.length).toBeGreaterThan(0);
  });

  it("writeTsConfigMarker creates the discovery marker so detectTypeScript reports present", async () => {
    await withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
      await env.writeTsConfigMarker();
      const detection = detectTypeScript(env.projectDir);
      expect(detection.present).toBe(true);
    });
  });

  it("writeSourceFile writes a file whose content includes the supplied value", async () => {
    const value = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const sourcePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    await withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
      await env.writeSourceFile(sourcePath, value);
      const content = await env.readFile(sourcePath);
      expect(content).toContain(value);
    });
  });

  it("writeTestFile writes a file whose content includes the supplied value", async () => {
    const value = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const testPath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
    await withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
      await env.writeTestFile(testPath, value);
      const content = await env.readFile(testPath);
      expect(content).toContain(value);
    });
  });

  it("writeReuseFixture produces project state that yields one srcReuse and one testDupe via literalCommand", async () => {
    const inputs: LiteralReuseFixtureInputs = sampleLiteralTestValue(
      LITERAL_TEST_GENERATOR.reuseFixtureInputs(),
    );
    await withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
      await env.writeReuseFixture(inputs);
      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        json: true,
      });
      const parsed = parseLiteralReuseResult(JSON.parse(result.output));
      expect(parsed.srcReuse).toHaveLength(1);
      expect(parsed.testDupe).toHaveLength(2);
    });
  });

  it("removes the temp directory when the callback returns normally", async () => {
    let projectDir = "";
    await withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
      projectDir = env.projectDir;
      expect(existsSync(projectDir)).toBe(true);
    });
    expect(existsSync(projectDir)).toBe(false);
  });

  it("removes the temp directory and rethrows when the callback throws", async () => {
    let projectDir = "";
    const thrownMessage = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await expect(
      withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
        projectDir = env.projectDir;
        throw new Error(thrownMessage);
      }),
    ).rejects.toThrow(thrownMessage);
    expect(existsSync(projectDir)).toBe(false);
  });

  it("concurrent invocations receive distinct projectDirs and isolated filesystem state", async () => {
    const sentinelPath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
    const sentinelValue = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const observations: Array<{ projectDir: string; sentinelExists: boolean }> = [];
    await Promise.all([
      withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
        await env.writeTestFile(sentinelPath, sentinelValue);
        observations.push({
          projectDir: env.projectDir,
          sentinelExists: existsSync(joinPath(env.projectDir, sentinelPath)),
        });
      }),
      withLiteralFixtureEnv(EMPTY_CONFIG, async (env) => {
        observations.push({
          projectDir: env.projectDir,
          sentinelExists: existsSync(joinPath(env.projectDir, sentinelPath)),
        });
      }),
    ]);
    expect(observations).toHaveLength(2);
    expect(observations[0]?.projectDir).not.toBe(observations[1]?.projectDir);
    const withSentinel = observations.filter((o) => o.sentinelExists);
    expect(withSentinel).toHaveLength(1);
  });
});
