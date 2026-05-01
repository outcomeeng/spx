import { CONFIG_FILE_FORMAT, DEFAULT_CONFIG_FILE_FORMAT, serializeConfigFileSections } from "@/config/index";
import type { Config } from "@/config/types";

import type { CliDeps, CliResult, ShowOptions } from "./types";

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
  const format = asJson ? CONFIG_FILE_FORMAT.JSON : DEFAULT_CONFIG_FILE_FORMAT;
  const serialized = serializeConfigFileSections(format, config as Record<string, unknown>);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}
