import { CONFIG_FILE_FORMAT, configFileForFormat, parseConfigFileSections } from "@/config/index";
import type { Config } from "@/config/types";
import type { Domain } from "@/domains/types";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { TESTING_SECTION, type TestingConfig } from "@/test/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

export type ProductContextCliRun = {
  readonly exitCodes: readonly number[];
  readonly stderr: string;
  readonly stdout: string;
};

export type ProductContextCliRunOptions = {
  readonly domains?: readonly Domain[];
  readonly processCwd: string;
};

class ProductContextCliRunExit extends Error {
  constructor(readonly exitCode: number) {
    super();
  }
}

export class ProductContextTempDirs {
  readonly #dirs: string[] = [];

  async makeTempDir(): Promise<string> {
    const tempDir = await createTempDir(sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix()));
    this.#dirs.push(tempDir);
    return tempDir;
  }

  async cleanup(): Promise<void> {
    for (const tempDir of this.#dirs.splice(0)) {
      await removeTempDir(tempDir);
    }
  }
}

export async function runProductContextCli(
  args: readonly string[],
  options: ProductContextCliRunOptions,
): Promise<ProductContextCliRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const program = createCliProgram({
    domains: options.domains,
    processCwd: () => options.processCwd,
    writeStdout: (output) => stdout.push(output),
    writeStderr: (output) => stderr.push(output),
    setExitCode: (exitCode) => exitCodes.push(exitCode),
    exit: (exitCode) => {
      exitCodes.push(exitCode);
      throw new ProductContextCliRunExit(exitCode);
    },
  });

  try {
    await program.parseAsync(args, { from: SPX_COMMANDER_PARSE_SOURCE });
  } catch (error) {
    if (!(error instanceof ProductContextCliRunExit)) throw error;
  }

  return {
    exitCodes,
    stderr: stderr.join(""),
    stdout: stdout.join(""),
  };
}

export function parseProductContextJsonConfig(raw: string, productDir: string): Config {
  const parsed = parseConfigFileSections(
    configFileForFormat(productDir, CONFIG_FILE_FORMAT.JSON, raw),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

export function productContextTestingConfig(config: Config): TestingConfig {
  return config[TESTING_SECTION] as TestingConfig;
}
