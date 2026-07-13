import type { ChildProcess, SpawnOptions } from "node:child_process";
import { join } from "node:path";

import type { KnipCommandDeps } from "@/commands/validation/knip";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import { detectTypeScript } from "@/validation/discovery";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { KNIP_LOCAL_BIN_SEGMENTS, validateKnip } from "@/validation/steps/knip";
import type { ScopeConfig } from "@/validation/types";
import { RecordingSpawnOptionsRunner, RecordingValidationChild } from "@testing/harnesses/validation/subprocess";

export interface KnipValidationCall {
  readonly productDir: string;
  readonly typescriptScope: ScopeConfig;
}

export interface KnipDiscoveryCall {
  readonly tool: string;
  readonly productDir: string | undefined;
}

export class OutputRecordingSpawnOptionsRunner extends RecordingSpawnOptionsRunner {
  constructor(
    private readonly stdout: string,
    private readonly closeCode: number,
  ) {
    super();
  }

  override spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.commands.push(command);
    this.args.push([...args]);
    this.options.push(options ?? {});
    const child = new RecordingValidationChild();
    this.children.push(child);
    queueMicrotask(() => {
      child.stdout.write(this.stdout);
      child.closeWithCode(this.closeCode);
    });
    return child.asChildProcess();
  }
}

export function createRecordingKnipCommandDeps(
  productDir: string,
  validationCalls: KnipValidationCall[],
  runner: RecordingSpawnOptionsRunner = new RecordingSpawnOptionsRunner(),
  discoveryCalls: KnipDiscoveryCall[] = [],
): KnipCommandDeps {
  const toolPath = join(productDir, ...KNIP_LOCAL_BIN_SEGMENTS);
  return {
    detectTypeScript,
    discoverTool: async (tool, options) => {
      discoveryCalls.push({ tool, productDir: options?.productDir });
      return {
        found: true,
        location: {
          tool: VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
          path: toolPath,
          source: TOOL_DISCOVERY.SOURCES.PROJECT,
        },
      };
    },
    validateKnip: async (context) => {
      validationCalls.push(context);
      return validateKnip(context, runner);
    },
  };
}
