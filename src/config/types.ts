export const RESULT_VALUE_KEY = "value";
export const RESULT_ERROR_KEY = "error";

/**
 * A success carrying a value or a failure carrying a reason. The reason defaults
 * to a plain string; a producer that composes its diagnostic for a terminal, or
 * that carries a kind a caller branches on, names its own error type instead.
 */
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export interface CliCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

export interface ConfigDescriptor<T> {
  readonly section: string;
  readonly defaults: T;
  validate(value: unknown): Result<T>;
}

export type Config = Readonly<Record<string, unknown>>;
