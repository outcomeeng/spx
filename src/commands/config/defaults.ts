import { CONFIG_FILE_FORMAT, DEFAULT_CONFIG_FILE_FORMAT, serializeConfigFileSections } from "@/config/index";
import type { Config } from "@/config/types";

import type { CliDeps, CliResult, DefaultsOptions } from "./types";

export function defaultsCommand(options: DefaultsOptions, deps: CliDeps): Promise<CliResult> {
  const config: Record<string, unknown> = {};
  for (const descriptor of deps.descriptors) {
    config[descriptor.section] = descriptor.defaults;
  }

  return Promise.resolve({
    stdout: formatConfig(config as Config, options.json === true),
    stderr: "",
    exitCode: 0,
  });
}

function formatConfig(config: Config, asJson: boolean): string {
  const format = asJson ? CONFIG_FILE_FORMAT.JSON : DEFAULT_CONFIG_FILE_FORMAT;
  const serialized = serializeConfigFileSections(format, config as Record<string, unknown>);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}
