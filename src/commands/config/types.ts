import type { Config, ConfigDescriptor, Result } from "@/config/types";

export type CliResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

export type CliDeps = {
  readonly resolveConfig: (projectRoot: string) => Promise<Result<Config>>;
  readonly resolveProjectRoot: () => string;
  readonly descriptors: readonly ConfigDescriptor<unknown>[];
};

export type OutputFormatOptions = { readonly json?: boolean };

export type ShowOptions = OutputFormatOptions;
export type DefaultsOptions = OutputFormatOptions;
export type ValidateOptions = Record<string, never>;

export const CONFIG_FILENAME = "spx.config.yaml";
