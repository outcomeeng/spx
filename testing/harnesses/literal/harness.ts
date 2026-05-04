import { TYPESCRIPT_MARKER } from "@/validation/discovery/index";
import type { LiteralReuseFixtureInputs } from "@testing/generators/literal/literal";
import { type Config, type SpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const EMPTY_TSCONFIG_CONTENT = "{}\n";
const SOURCE_BINDING_NAME = "V";
const TEST_VARIABLE_NAME = "v";

export interface LiteralFixtureEnv {
  readonly projectDir: string;
  readFile(relativePath: string): Promise<string>;
  writeTsConfigMarker(): Promise<void>;
  writeSourceFile(relativePath: string, value: string): Promise<void>;
  writeTestFile(relativePath: string, value: string): Promise<void>;
  writeReuseFixture(inputs: LiteralReuseFixtureInputs): Promise<void>;
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
    projectDir: specEnv.projectDir,
    readFile: (relativePath) => specEnv.readFile(relativePath),
    writeTsConfigMarker: () => specEnv.writeRaw(TYPESCRIPT_MARKER, EMPTY_TSCONFIG_CONTENT),
    writeSourceFile: (relativePath, value) => specEnv.writeRaw(relativePath, formatSourceFile(value)),
    writeTestFile: (relativePath, value) => specEnv.writeRaw(relativePath, formatTestFile(value)),
    writeReuseFixture: (inputs) => writeReuseFixture(specEnv, inputs),
  };
}

async function writeReuseFixture(specEnv: SpecTreeEnv, inputs: LiteralReuseFixtureInputs): Promise<void> {
  await specEnv.writeRaw(TYPESCRIPT_MARKER, EMPTY_TSCONFIG_CONTENT);
  await specEnv.writeRaw(inputs.reuseSourceFile, formatSourceFile(inputs.reuseLiteral));
  await specEnv.writeRaw(inputs.reuseTestFile, formatTestFile(inputs.reuseLiteral));
  await specEnv.writeRaw(inputs.dupeFirstTestFile, formatTestFile(inputs.dupeLiteral));
  await specEnv.writeRaw(inputs.dupeSecondTestFile, formatTestFile(inputs.dupeLiteral));
}

function formatSourceFile(value: string): string {
  return `export const ${SOURCE_BINDING_NAME} = ${JSON.stringify(value)};\n`;
}

function formatTestFile(value: string): string {
  return `expect(${TEST_VARIABLE_NAME}).toBe(${JSON.stringify(value)});\n`;
}
