import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { configFileForFormat, DEFAULT_CONFIG_FILE_FORMAT, serializeConfigFileSections } from "@/config/index";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/index";
import type {
  LiteralPathScopedSourceReuseFixtureInputs,
  LiteralReuseFixtureInputs,
  LiteralSourceReuseFixtureInputs,
} from "@testing/generators/literal/literal";
import { arbitraryLiteralReuseFixtureInputs, literalEmptyConfig } from "@testing/generators/literal/literal";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { buildStringAssertion, buildStringDeclaration } from "@testing/harnesses/literal/snippets";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { collectHarnessTestCases, expect, it } from "@testing/harnesses/vitest-registration";

const EMPTY_TSCONFIG_CONTENT = "{}\n";

export interface LiteralFixtureEnv {
  readonly productDir: string;
  readFile(relativePath: string): Promise<string>;
  writeTsConfigMarker(): Promise<void>;
  writeSourceFile(relativePath: string, value: string): Promise<void>;
  writeTestFile(relativePath: string, value: string): Promise<void>;
  writeGitignore(directory: string, content: string): Promise<void>;
  writeReuseFixture(inputs: LiteralReuseFixtureInputs): Promise<void>;
  writeSourceReuseFixture(inputs: LiteralSourceReuseFixtureInputs): Promise<void>;
  writeSourceReuseFixtures(inputs: readonly LiteralSourceReuseFixtureInputs[]): Promise<void>;
  writePathScopedSourceReuseFixture(inputs: LiteralPathScopedSourceReuseFixtureInputs): Promise<void>;
  writeRaw(relativePath: string, content: string): Promise<void>;
}

export async function withLiteralFixtureEnv<T>(
  config: Config,
  callback: (env: LiteralFixtureEnv) => Promise<T>,
): Promise<T> {
  const NOT_SET = Symbol("withLiteralFixtureEnv.callback-not-completed");
  let captured: T | typeof NOT_SET = NOT_SET;
  await withGitWorktreeEnv(async (gitEnv) => {
    const configFile = configFileForFormat(gitEnv.productDir, DEFAULT_CONFIG_FILE_FORMAT);
    const serialized = serializeConfigFileSections(configFile.format, config);
    if (!serialized.ok) {
      throw new Error(serialized.error);
    }
    await gitEnv.writeUntracked(configFile.filename, serialized.value);
    const env = createLiteralFixtureEnv(gitEnv);
    captured = await callback(env);
  });
  if (captured === NOT_SET) {
    throw new Error("withLiteralFixtureEnv: callback did not complete");
  }
  return captured;
}

export const literalFixtureHarnessPropertyCases = collectHarnessTestCases(() => {
  it("writeReuseFixture is deterministic over LiteralReuseFixtureInputs", async () => {
    await assertProperty(
      arbitraryLiteralReuseFixtureInputs(),
      async (inputs) => {
        expect(await captureReuseFixtureFiles(inputs)).toEqual(await captureReuseFixtureFiles(inputs));
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

type LiteralFixtureGitEnv = {
  readonly productDir: string;
  writeGitignore(directory: string, content: string): Promise<void>;
  writeUntracked(relativePath: string, content: string): Promise<void>;
};

function createLiteralFixtureEnv(gitEnv: LiteralFixtureGitEnv): LiteralFixtureEnv {
  return {
    productDir: gitEnv.productDir,
    readFile: (relativePath) => readFile(join(gitEnv.productDir, relativePath), "utf8"),
    writeTsConfigMarker: () => gitEnv.writeUntracked(TYPESCRIPT_MARKER, EMPTY_TSCONFIG_CONTENT),
    writeSourceFile: (relativePath, value) => gitEnv.writeUntracked(relativePath, formatSourceFile(value)),
    writeTestFile: (relativePath, value) => gitEnv.writeUntracked(relativePath, formatTestFile(value)),
    writeGitignore: (directory, content) => gitEnv.writeGitignore(directory, content),
    writeReuseFixture: (inputs) => writeReuseFixture(gitEnv, inputs),
    writeSourceReuseFixture: (inputs) => writeSourceReuseFixture(gitEnv, inputs),
    writeSourceReuseFixtures: (inputs) => writeSourceReuseFixtures(gitEnv, inputs),
    writePathScopedSourceReuseFixture: (inputs) => writePathScopedSourceReuseFixture(gitEnv, inputs),
    writeRaw: (relativePath, content) => gitEnv.writeUntracked(relativePath, content),
  };
}

async function captureReuseFixtureFiles(inputs: LiteralReuseFixtureInputs): Promise<Record<string, string>> {
  const captured: Record<string, string> = {};
  await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
    await env.writeReuseFixture(inputs);
    for (
      const path of [
        inputs.reuseSourceFile,
        inputs.reuseTestFile,
        inputs.dupeFirstTestFile,
        inputs.dupeSecondTestFile,
      ]
    ) {
      captured[path] = await env.readFile(path);
    }
  });
  return captured;
}

async function writeReuseFixture(gitEnv: LiteralFixtureGitEnv, inputs: LiteralReuseFixtureInputs): Promise<void> {
  await writeSourceReuseFixture(gitEnv, {
    literal: inputs.reuseLiteral,
    sourceFile: inputs.reuseSourceFile,
    testFile: inputs.reuseTestFile,
  });
  await gitEnv.writeUntracked(inputs.dupeFirstTestFile, formatTestFile(inputs.dupeLiteral));
  await gitEnv.writeUntracked(inputs.dupeSecondTestFile, formatTestFile(inputs.dupeLiteral));
}

async function writeSourceReuseFixture(
  gitEnv: LiteralFixtureGitEnv,
  inputs: LiteralSourceReuseFixtureInputs,
): Promise<void> {
  await gitEnv.writeUntracked(TYPESCRIPT_MARKER, EMPTY_TSCONFIG_CONTENT);
  await gitEnv.writeUntracked(inputs.sourceFile, formatSourceFile(inputs.literal));
  await gitEnv.writeUntracked(inputs.testFile, formatTestFile(inputs.literal));
}

async function writeSourceReuseFixtures(
  gitEnv: LiteralFixtureGitEnv,
  inputs: readonly LiteralSourceReuseFixtureInputs[],
): Promise<void> {
  for (const fixture of inputs) {
    await writeSourceReuseFixture(gitEnv, fixture);
  }
}

async function writePathScopedSourceReuseFixture(
  gitEnv: LiteralFixtureGitEnv,
  inputs: LiteralPathScopedSourceReuseFixtureInputs,
): Promise<void> {
  await writeSourceReuseFixtures(gitEnv, [inputs.included, inputs.excluded]);
}

function formatSourceFile(value: string): string {
  return buildStringDeclaration(value);
}

function formatTestFile(value: string): string {
  return buildStringAssertion(value);
}
