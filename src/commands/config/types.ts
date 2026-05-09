import type { ConfigFileReadResult } from "@/config";
import type { Config, ConfigDescriptor, Result } from "@/config/types";

export type CliResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

export type CliDeps = {
  readonly resolveConfig: (projectRoot: string) => Promise<Result<Config>>;
  readonly readProjectConfigFile: (projectRoot: string) => Promise<Result<ConfigFileReadResult>>;
  readonly resolveConfigFromReadResult: (
    readResult: ConfigFileReadResult,
    descriptors: readonly ConfigDescriptor<unknown>[],
  ) => Result<Config>;
  readonly resolveProjectRoot: () => string;
  readonly descriptors: readonly ConfigDescriptor<unknown>[];
};

export type OutputFormatOptions = { readonly json?: boolean };

export type ShowOptions = OutputFormatOptions;
export type DefaultsOptions = OutputFormatOptions;
export type ValidateOptions = Record<string, never>;
