import { stringify as yamlStringify } from "yaml";

import type { Config } from "@/config/types";

import type { CliDeps, CliResult, DefaultsOptions } from "./types";

const JSON_INDENT = 2;

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
  if (asJson) {
    return `${JSON.stringify(config, null, JSON_INDENT)}\n`;
  }
  return yamlStringify(config);
}
