import { stringify as yamlStringify } from "yaml";

import type { Config } from "@/config/types.js";

import type { CliDeps, CliResult, ShowOptions } from "./types.js";

const JSON_INDENT = 2;
const EXIT_CODE_ERROR = 1;

export async function showCommand(options: ShowOptions, deps: CliDeps): Promise<CliResult> {
  const projectRoot = deps.resolveProjectRoot();
  const result = await deps.resolveConfig(projectRoot);

  if (!result.ok) {
    return {
      stdout: "",
      stderr: `${result.error}\n`,
      exitCode: EXIT_CODE_ERROR,
    };
  }

  return {
    stdout: formatConfig(result.value, options.json === true),
    stderr: "",
    exitCode: 0,
  };
}

function formatConfig(config: Config, asJson: boolean): string {
  if (asJson) {
    return `${JSON.stringify(config, null, JSON_INDENT)}\n`;
  }
  return yamlStringify(config);
}
