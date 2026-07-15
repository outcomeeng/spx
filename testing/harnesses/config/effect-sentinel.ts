import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { isDeepStrictEqual } from "node:util";

const EFFECT_SENTINEL_SUCCESS = "CONFIG_EFFECT_SENTINEL_OK";
const CANARY_PATH = "/config-handler-effect-sentinel-canary";
const CHILD_PROCESS_METHODS = ["exec", "execFile", "fork", "spawn", "execSync", "execFileSync", "spawnSync"] as const;
const FILESYSTEM_METHODS = [
  "appendFile",
  "chmod",
  "chown",
  "copyFile",
  "cp",
  "link",
  "mkdir",
  "mkdtemp",
  "open",
  "rename",
  "rm",
  "symlink",
  "truncate",
  "unlink",
  "writeFile",
] as const;
const FILESYSTEM_SYNC_METHODS = [
  "appendFileSync",
  "chmodSync",
  "chownSync",
  "copyFileSync",
  "cpSync",
  "createWriteStream",
  "linkSync",
  "mkdirSync",
  "mkdtempSync",
  "openSync",
  "renameSync",
  "rmSync",
  "symlinkSync",
  "truncateSync",
  "unlinkSync",
  "writeFileSync",
] as const;

type MutableBuiltin = Record<string, unknown>;

const requireBuiltin = createRequire(import.meta.url);
const childProcess = requireBuiltin("node:child_process") as MutableBuiltin;
const filesystem = requireBuiltin("node:fs") as MutableBuiltin;
const filesystemPromises = requireBuiltin("node:fs/promises") as MutableBuiltin;
const attemptedEffects: string[] = [];
const restorers: Array<() => void> = [];

function trapMethod(target: MutableBuiltin, method: string, owner: string): void {
  const original = target[method];
  if (typeof original !== "function") {
    throw new Error(`Missing ${owner}.${method} effect sentinel target`);
  }
  target[method] = (..._args: readonly unknown[]) => {
    const effect = `${owner}.${method}`;
    attemptedEffects.push(effect);
    throw new Error(`${effect} called by config handler`);
  };
  restorers.push(() => {
    target[method] = original;
  });
}

function installEffectTraps(): void {
  for (const method of CHILD_PROCESS_METHODS) trapMethod(childProcess, method, "node:child_process");
  for (const method of FILESYSTEM_METHODS) trapMethod(filesystemPromises, method, "node:fs/promises");
  for (const method of FILESYSTEM_SYNC_METHODS) trapMethod(filesystem, method, "node:fs");
  syncBuiltinESMExports();
}

function restoreEffectTraps(): void {
  for (const restore of restorers.reverse()) restore();
  syncBuiltinESMExports();
}

async function proveCaughtAttemptsRemainObservable(): Promise<void> {
  try {
    await writeFile(CANARY_PATH, EFFECT_SENTINEL_SUCCESS);
  } catch {
    // The trap records the attempt before the simulated denial is caught.
  }
  try {
    spawnSync(process.execPath, ["--version"]);
  } catch {
    // The trap records the attempt before the simulated denial is caught.
  }
  expectAttempts([
    "node:fs/promises.writeFile",
    "node:child_process.spawnSync",
  ]);
  attemptedEffects.length = 0;
}

function expectAttempts(expected: readonly string[]): void {
  if (!isDeepStrictEqual(attemptedEffects, expected)) {
    throw new Error(`Expected effects ${JSON.stringify(expected)}, observed ${JSON.stringify(attemptedEffects)}`);
  }
}

installEffectTraps();

try {
  await proveCaughtAttemptsRemainObservable();

  const { defaultsCommand } = await import("@/commands/config/defaults");
  const { showCommand } = await import("@/commands/config/show");
  const { validateCommand } = await import("@/commands/config/validate");
  const { CONFIG_TEST_GENERATOR, sampleConfigTestValue } = await import(
    "@testing/generators/config/descriptors"
  );
  const { configCliDefaults, configCliDeps } = await import("@testing/harnesses/config/cli");

  const initialCwd = process.cwd();
  const initialEnvironment = { ...process.env };
  const successfulDeps = configCliDeps({ ok: true, value: configCliDefaults() });
  const rejectedDeps = configCliDeps({
    ok: false,
    error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
  });

  await showCommand({}, successfulDeps);
  await showCommand({ json: true }, successfulDeps);
  await showCommand({}, rejectedDeps);
  await validateCommand({}, successfulDeps);
  await validateCommand({}, rejectedDeps);
  await defaultsCommand({}, successfulDeps);
  await defaultsCommand({ json: true }, successfulDeps);

  expectAttempts([]);
  if (process.cwd() !== initialCwd) {
    throw new Error("config handler changed the process working directory");
  }
  if (!isDeepStrictEqual({ ...process.env }, initialEnvironment)) {
    throw new Error("config handler mutated the process environment");
  }
} finally {
  restoreEffectTraps();
}

console.log(EFFECT_SENTINEL_SUCCESS);
