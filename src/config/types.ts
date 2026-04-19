export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ConfigDescriptor<T> {
  readonly section: string;
  readonly defaults: T;
  validate(value: unknown): Result<T>;
}

export type Config = Readonly<Record<string, unknown>>;
