import { existsSync } from "node:fs";
import { join as joinPath } from "node:path";

import { describe, expect, it } from "vitest";

import { LITERAL_EXIT_CODES } from "@/commands/validation/literal";
import { literalCommand } from "@/commands/validation/literal";
import { detectTypeScript } from "@/validation/discovery/index";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { parseLiteralReuseResult } from "@/validation/literal/index";
import {
  LITERAL_TEST_GENERATOR,
  LITERAL_TEST_GENERATOR_COUNTS,
  literalEmptyConfig,
  type LiteralReuseFixtureInputs,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("withLiteralFixtureEnv", () => {
  it("materializes a temp project and provides projectDir to the callback", async () => {
    let captured = "";
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      captured = env.projectDir;
      expect(existsSync(env.projectDir)).toBe(true);
    });
    expect(captured.length).toBeGreaterThan(LITERAL_TEST_GENERATOR_COUNTS.none);
  });

  it("writeTsConfigMarker creates the discovery marker so detectTypeScript reports present", async () => {
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      await env.writeTsConfigMarker();
      const detection = detectTypeScript(env.projectDir);
      expect(detection.present).toBe(true);
    });
  });

  it("writeSourceFile writes a file whose content includes the supplied value", async () => {
    const value = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const sourcePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      await env.writeSourceFile(sourcePath, value);
      const content = await env.readFile(sourcePath);
      expect(content).toContain(value);
    });
  });

  it("writeTestFile writes a file whose content includes the supplied value", async () => {
    const value = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const testPath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      await env.writeTestFile(testPath, value);
      const content = await env.readFile(testPath);
      expect(content).toContain(value);
    });
  });

  it("writeReuseFixture produces project state that yields one srcReuse and one testDupe via literalCommand", async () => {
    const inputs: LiteralReuseFixtureInputs = sampleLiteralTestValue(
      LITERAL_TEST_GENERATOR.reuseFixtureInputs(),
    );
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      await env.writeReuseFixture(inputs);
      const result = await literalCommand({
        cwd: env.projectDir,
        config: LITERAL_DEFAULTS,
        json: true,
      });
      const parsed = parseLiteralReuseResult(JSON.parse(result.output));
      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.FINDINGS);
      expect(parsed.srcReuse).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.one);
      expect(parsed.testDupe).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.two);
    });
  });

  it("removes the temp directory when the callback returns normally", async () => {
    let projectDir = "";
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      projectDir = env.projectDir;
      expect(existsSync(projectDir)).toBe(true);
    });
    expect(existsSync(projectDir)).toBe(false);
  });

  it("removes the temp directory and rethrows when the callback throws", async () => {
    let projectDir = "";
    const thrownMessage = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await expect(
      withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
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
      withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
        await env.writeTestFile(sentinelPath, sentinelValue);
        observations.push({
          projectDir: env.projectDir,
          sentinelExists: existsSync(joinPath(env.projectDir, sentinelPath)),
        });
      }),
      withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
        observations.push({
          projectDir: env.projectDir,
          sentinelExists: existsSync(joinPath(env.projectDir, sentinelPath)),
        });
      }),
    ]);
    expect(observations).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.two);
    expect(observations[0]?.projectDir).not.toBe(observations[1]?.projectDir);
    const withSentinel = observations.filter((o) => o.sentinelExists);
    expect(withSentinel).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.one);
  });
});
