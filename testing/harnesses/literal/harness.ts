import { TYPESCRIPT_MARKER } from "@/validation/discovery/index";
import type {
  LiteralPathScopedSourceReuseFixtureInputs,
  LiteralReuseFixtureInputs,
  LiteralSourceReuseFixtureInputs,
} from "@testing/generators/literal/literal";
import { buildStringAssertion, buildStringDeclaration } from "@testing/harnesses/literal/snippets";
import { type Config, type SpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const EMPTY_TSCONFIG_CONTENT = "{}\n";

export interface LiteralFixtureEnv {
  readonly productDir: string;
  readFile(relativePath: string): Promise<string>;
  writeTsConfigMarker(): Promise<void>;
  writeSourceFile(relativePath: string, value: string): Promise<void>;
  writeTestFile(relativePath: string, value: string): Promise<void>;
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
  await withTestEnv(config, async (specEnv) => {
    const env = createLiteralFixtureEnv(specEnv);
    captured = await callback(env);
  });
  if (captured === NOT_SET) {
    throw new Error("withLiteralFixtureEnv: callback did not complete");
  }
  return captured;
}

function createLiteralFixtureEnv(specEnv: SpecTreeEnv): LiteralFixtureEnv {
  return {
    productDir: specEnv.productDir,
    readFile: (relativePath) => specEnv.readFile(relativePath),
    writeTsConfigMarker: () => specEnv.writeRaw(TYPESCRIPT_MARKER, EMPTY_TSCONFIG_CONTENT),
    writeSourceFile: (relativePath, value) => specEnv.writeRaw(relativePath, formatSourceFile(value)),
    writeTestFile: (relativePath, value) => specEnv.writeRaw(relativePath, formatTestFile(value)),
    writeReuseFixture: (inputs) => writeReuseFixture(specEnv, inputs),
    writeSourceReuseFixture: (inputs) => writeSourceReuseFixture(specEnv, inputs),
    writeSourceReuseFixtures: (inputs) => writeSourceReuseFixtures(specEnv, inputs),
    writePathScopedSourceReuseFixture: (inputs) => writePathScopedSourceReuseFixture(specEnv, inputs),
    writeRaw: (relativePath, content) => specEnv.writeRaw(relativePath, content),
  };
}

async function writeReuseFixture(specEnv: SpecTreeEnv, inputs: LiteralReuseFixtureInputs): Promise<void> {
  await writeSourceReuseFixture(specEnv, {
    literal: inputs.reuseLiteral,
    sourceFile: inputs.reuseSourceFile,
    testFile: inputs.reuseTestFile,
  });
  await specEnv.writeRaw(inputs.dupeFirstTestFile, formatTestFile(inputs.dupeLiteral));
  await specEnv.writeRaw(inputs.dupeSecondTestFile, formatTestFile(inputs.dupeLiteral));
}

async function writeSourceReuseFixture(
  specEnv: SpecTreeEnv,
  inputs: LiteralSourceReuseFixtureInputs,
): Promise<void> {
  await specEnv.writeRaw(TYPESCRIPT_MARKER, EMPTY_TSCONFIG_CONTENT);
  await specEnv.writeRaw(inputs.sourceFile, formatSourceFile(inputs.literal));
  await specEnv.writeRaw(inputs.testFile, formatTestFile(inputs.literal));
}

async function writeSourceReuseFixtures(
  specEnv: SpecTreeEnv,
  inputs: readonly LiteralSourceReuseFixtureInputs[],
): Promise<void> {
  for (const fixture of inputs) {
    await writeSourceReuseFixture(specEnv, fixture);
  }
}

async function writePathScopedSourceReuseFixture(
  specEnv: SpecTreeEnv,
  inputs: LiteralPathScopedSourceReuseFixtureInputs,
): Promise<void> {
  await writeSourceReuseFixtures(specEnv, [inputs.included, inputs.excluded]);
}

function formatSourceFile(value: string): string {
  return buildStringDeclaration(value);
}

function formatTestFile(value: string): string {
  return buildStringAssertion(value);
}
