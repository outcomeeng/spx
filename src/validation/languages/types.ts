/**
 * Language descriptor contract for the validation registry.
 *
 * Each language declares its quality-gate participation through a typed
 * descriptor that enumerates the validation stages it contributes. A stage
 * exposes a uniform `run` callable so orchestration iterates stages without
 * referencing any language or stage by name.
 */
import type { ValidationCommandResult } from "@/commands/validation/types";
import type { ValidationSubprocessOutputStreams } from "@/validation/steps/subprocess-output";
import type { ValidationScope } from "@/validation/types";

/** Context threaded to every stage runner by the orchestrator. */
export interface ValidationStageContext {
  /** Working directory of the project under validation. */
  readonly cwd: string;
  /** Validation scope (`full` or `production`). */
  readonly scope?: ValidationScope;
  /** Explicit caller file scope. */
  readonly files?: string[];
  /** Auto-fix flag for stages that support writing fixes. */
  readonly fix?: boolean;
  /** Suppress progress output. */
  readonly quiet?: boolean;
  /** Emit machine-readable output. */
  readonly json?: boolean;
  /** Skip circular dependency detection for this full-pipeline run. */
  readonly skipCircular?: boolean;
  /** Skip literal-reuse detection for this full-pipeline run. */
  readonly skipLiteral?: boolean;
  /** Parent streams that receive validation subprocess output. */
  readonly outputStreams?: ValidationSubprocessOutputStreams;
}

/** A single validation stage a language contributes to the pipeline. */
export interface ValidationStage {
  /** Display name surfaced in pipeline output and diagnostics. */
  readonly name: string;
  /** Executes the stage against the supplied context. */
  readonly run: (context: ValidationStageContext) => Promise<ValidationCommandResult>;
  /** Whether a non-zero exit from this stage fails the overall pipeline. */
  readonly failsPipeline: boolean;
}

/** A language's quality-gate participation: the ordered stages it contributes. */
export interface ValidationLanguageDescriptor {
  /** Language identity (e.g. the language whose descriptor module this is). */
  readonly name: string;
  /** Ordered stages this language contributes to the pipeline. */
  readonly stages: readonly ValidationStage[];
}

/** The composed set of language descriptors known to the orchestrator. */
export interface ValidationRegistry {
  readonly languages: readonly ValidationLanguageDescriptor[];
}
