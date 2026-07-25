import type { TerminalText } from "@/lib/terminal-text/terminal-text";
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
  readonly warning?: TerminalText;
};

export type CliIo = {
  readonly writeStdout: (output: string) => void;
  readonly writeStderr: (output: string) => void;
  /**
   * Relays a document the product did not compose — agent-authored release notes, the exact
   * bytes of a read file, or a subprocess's own output — to standard output unchanged.
   *
   * This channel makes no terminal-safety claim, which is the whole distinction from
   * {@link CliIo.writeStdout}: composed spx output states what the product itself says, so every
   * externally-originated segment of it is escaped, while a relayed document is the external
   * artifact itself and escaping it would corrupt the thing the caller asked to see. A document
   * carrying an escape byte therefore reaches the terminal intact, and a command chooses this
   * channel only when its output *is* the foreign document rather than a report about it.
   */
  readonly writePassThrough: (document: string) => void;
  /**
   * Relays a document the product did not compose to standard error unchanged, carrying the same
   * no-safety-claim contract as {@link CliIo.writePassThrough}.
   *
   * A subprocess writes its diagnostics to its own standard error, and those bytes are as much
   * the tool's own document as the ones on its standard output — a compiler's caret diagnostics
   * and a linter's colour are exactly what escaping would destroy. The relay therefore covers
   * both streams, so which stream a foreign document lands on never decides whether the product
   * can state what that output is.
   */
  readonly writePassThroughError: (document: string) => void;
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
  readonly writeWarning: (warning: TerminalText | undefined) => void;
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
  writePassThrough: (document) => {
    process.stdout.write(document);
  },
  writePassThroughError: (document) => {
    process.stderr.write(document);
  },
  setExitCode: (exitCode) => {
    process.exitCode = exitCode;
  },
  exit: (exitCode) => process.exit(exitCode),
};
