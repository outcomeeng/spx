import type { KnipCommandDeps } from "@/commands/validation/knip";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import { detectTypeScript } from "@/validation/discovery";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { validateKnip } from "@/validation/steps/knip";
import type { ScopeConfig } from "@/validation/types";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";

export interface KnipValidationCall {
  readonly productDir: string;
  readonly typescriptScope: ScopeConfig;
}

export function createRecordingKnipCommandDeps(
  productDir: string,
  validationCalls: KnipValidationCall[],
  runner: RecordingSpawnOptionsRunner = new RecordingSpawnOptionsRunner(),
): KnipCommandDeps {
  return {
    detectTypeScript,
    discoverTool: async () => ({
      found: true,
      location: {
        tool: VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
        path: productDir,
        source: TOOL_DISCOVERY.SOURCES.PROJECT,
      },
    }),
    validateKnip: async (context) => {
      validationCalls.push(context);
      return validateKnip(context, runner);
    },
  };
}
