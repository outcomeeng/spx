import { resolve } from "node:path";

import { type ResolvedProductDir, resolveProductDir } from "@/domains/config/root";

export const SPX_GLOBAL_OPTIONS = {
  directory: {
    short: "-C",
    long: "--directory",
    operand: "<path>",
    flags: "-C, --directory <path>",
    description: "Run as if spx was started in <path>",
  },
} as const;

export const SPX_COMMANDER_PARSE_SOURCE = "user";

export type ProductContext = {
  readonly effectiveInvocationDir: string;
  readonly productDir: string;
  readonly warning?: string;
};

export type CliIo = {
  readonly writeStdout: (output: string) => void;
  readonly writeStderr: (output: string) => void;
  readonly setExitCode: (exitCode: number) => void;
  readonly exit: (exitCode: number) => never;
};

export type CliInvocation = {
  readonly io: CliIo;
  resolveEffectiveInvocationDir(): string;
  resolveProductContext(): ProductContext;
};

export type CliInvocationOptions = {
  readonly readDirectoryOption: () => string | undefined;
  readonly processCwd: () => string;
  readonly resolveProductDir?: (cwd: string) => ResolvedProductDir;
  readonly writeWarning: (warning: string | undefined) => void;
  readonly io: CliIo;
};

export function createCliInvocation(options: CliInvocationOptions): CliInvocation {
  let cachedEffectiveInvocationDir: string | undefined;
  let cachedContext: ProductContext | undefined;

  const resolveEffectiveInvocationDir = (): string => {
    cachedEffectiveInvocationDir ??= resolve(options.processCwd(), options.readDirectoryOption() ?? "");
    return cachedEffectiveInvocationDir;
  };

  return {
    io: options.io,
    resolveEffectiveInvocationDir,
    resolveProductContext: () => {
      if (cachedContext !== undefined) {
        return cachedContext;
      }

      const effectiveInvocationDir = resolveEffectiveInvocationDir();
      const resolved = (options.resolveProductDir ?? resolveProductDir)(effectiveInvocationDir);
      cachedContext = {
        effectiveInvocationDir,
        productDir: resolved.productDir,
        ...(resolved.warning === undefined ? {} : { warning: resolved.warning }),
      };
      options.writeWarning(cachedContext.warning);
      return cachedContext;
    },
  };
}

export const DEFAULT_CLI_IO: CliIo = {
  writeStdout: (output) => {
    process.stdout.write(output);
  },
  writeStderr: (output) => {
    process.stderr.write(output);
  },
  setExitCode: (exitCode) => {
    process.exitCode = exitCode;
  },
  exit: (exitCode) => process.exit(exitCode),
};
