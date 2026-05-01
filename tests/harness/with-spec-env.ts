/**
 * Test environment context manager
 *
 * Provides automatic setup and teardown for test environments.
 */
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FixtureConfig, generateFixtureTree } from "./fixture-generator";
import { materializeFixture } from "./fixture-writer";

/**
 * Options for test environment setup
 */
export interface TestEnvOptions {
  /** Generate full fixture from config. */
  fixture?: FixtureConfig;

  /** Create empty specs/work/doing structure (ignored if fixture provided) */
  emptySpecs?: boolean;
}

/**
 * Context passed to test callback
 */
export interface TestEnvContext {
  /** Absolute path to test environment root */
  path: string;
}

/**
 * Execute test with automatic environment setup and cleanup
 *
 * @example
 * // Bare temp directory
 * await withTestEnv(async ({ path }) => {
 *   // path is a unique temp directory
 * });
 *
 * @example
 * // Empty specs structure
 * await withTestEnv({ emptySpecs: true }, async ({ path }) => {
 *   // path contains specs/work/doing/
 * });
 *
 * @example
 * // Full fixture
 * await withTestEnv({ fixture: PRESETS.SHALLOW_50 }, async ({ path }) => {
 *   // path contains generated fixture
 * });
 */
export async function withSpecEnv<T>(
  fn: (ctx: TestEnvContext) => Promise<T>,
): Promise<T>;

export async function withSpecEnv<T>(
  options: TestEnvOptions,
  fn: (ctx: TestEnvContext) => Promise<T>,
): Promise<T>;

export async function withSpecEnv<T>(
  optionsOrFn: TestEnvOptions | ((ctx: TestEnvContext) => Promise<T>),
  maybeFn?: (ctx: TestEnvContext) => Promise<T>,
): Promise<T> {
  // Parse overloads
  const [options, fn] = typeof optionsOrFn === "function"
    ? [{}, optionsOrFn]
    : [optionsOrFn, maybeFn!];

  // Fixture path: generate and materialize through the shared fixture harness.
  if (options.fixture) {
    const tree = generateFixtureTree(options.fixture);
    const fixture = await materializeFixture(tree);
    try {
      return await fn({ path: fixture.path });
    } finally {
      await fixture.cleanup();
    }
  }

  // Bare temp or emptySpecs path
  const tempPath = join(tmpdir(), `spx-test-${randomUUID()}`);
  await mkdir(tempPath, { recursive: true });

  try {
    if (options.emptySpecs) {
      await mkdir(join(tempPath, "specs", "work", "doing"), { recursive: true });
    }
    return await fn({ path: tempPath });
  } finally {
    try {
      await rm(tempPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (directory may already be deleted)
    }
  }
}
