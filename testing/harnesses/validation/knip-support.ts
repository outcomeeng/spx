import type { ChildProcess, SpawnOptions } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { KnipCommandDeps } from "@/commands/validation/knip";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import { detectTypeScript } from "@/validation/discovery";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { KNIP_COMMAND_TOKENS, KNIP_LOCAL_BIN_SEGMENTS, validateKnip } from "@/validation/steps/knip";
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

export class ScopedKnipRecordingRunner extends RecordingSpawnOptionsRunner {
  readonly scopedIncludes: string[][] = [];

  override spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    const configFlagIndex = args.indexOf(KNIP_COMMAND_TOKENS.TSCONFIG_FLAG);
    const configPath = args[configFlagIndex + 1];
    if (configFlagIndex < 0) {
      throw new Error("Knip scoped tsconfig argument is missing");
    }
    const config = JSON.parse(readFileSync(configPath, "utf8")) as { include?: string[] };
    this.scopedIncludes.push(config.include ?? []);
    return super.spawn(command, args, options);
  }
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

export class ErrorOutputRecordingSpawnOptionsRunner extends RecordingSpawnOptionsRunner {
  constructor(
    private readonly stderr: string,
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
      child.stderr.write(this.stderr);
      child.closeWithCode(this.closeCode);
    });
    return child.asChildProcess();
  }
}

export class ExpectedExecutableRunner extends RecordingSpawnOptionsRunner {
  constructor(private readonly expectedExecutable: string) {
    super();
  }

  override spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    if (command !== this.expectedExecutable) {
      throw new Error(
        `Knip spawned ${command} instead of discovered executable ${this.expectedExecutable}`,
      );
    }
    return super.spawn(command, args, options);
  }
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
