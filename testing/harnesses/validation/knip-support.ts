import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { KnipCommandDeps } from "@/commands/validation/knip";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import { detectTypeScript } from "@/validation/discovery";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { KNIP_COMMAND_TOKENS, KNIP_LOCAL_BIN_SEGMENTS, validateKnip } from "@/validation/steps/knip";
import type { ScopeConfig } from "@/validation/types";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";

export interface KnipValidationCall {
  readonly productDir: string;
  readonly typescriptScope: ScopeConfig;
}

export interface KnipDiscoveryCall {
  readonly tool: string;
  readonly productDir: string | undefined;
}

/** A shared recording runner, and the `include` list of the scoped tsconfig each Knip spawn names. */
export interface ScopedKnipRecording {
  readonly runner: RecordingSpawnOptionsRunner;
  readonly scopedIncludes: readonly string[][];
}

export function createScopedKnipRecording(): ScopedKnipRecording {
  const scopedIncludes: string[][] = [];
  const runner = new RecordingSpawnOptionsRunner({
    observeSpawn: (_command, args) => {
      const configFlagIndex = args.indexOf(KNIP_COMMAND_TOKENS.TSCONFIG_FLAG);
      if (configFlagIndex < 0) {
        throw new Error("Knip scoped tsconfig argument is missing");
      }
      const configPath = args[configFlagIndex + 1];
      const config = JSON.parse(readFileSync(configPath, "utf8")) as { include?: string[] };
      scopedIncludes.push(config.include ?? []);
    },
  });
  return { runner, scopedIncludes };
}

export function createRecordingKnipCommandDeps(
  productDir: string,
  validationCalls: KnipValidationCall[],
  runner: RecordingSpawnOptionsRunner = new RecordingSpawnOptionsRunner(),
  discoveryCalls: KnipDiscoveryCall[] = [],
  discoveredToolPath: string = join(productDir, ...KNIP_LOCAL_BIN_SEGMENTS),
): KnipCommandDeps {
  return {
    detectTypeScript,
    discoverTool: async (tool, options) => {
      discoveryCalls.push({ tool, productDir: options?.productDir });
      return {
        found: true,
        location: {
          tool: VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
          path: discoveredToolPath,
          source: TOOL_DISCOVERY.SOURCES.PROJECT,
        },
      };
    },
    validateKnip: async (context, _processRunner, deps, outputStreams) => {
      validationCalls.push(context);
      return validateKnip(context, runner, deps, outputStreams);
    },
  };
}
