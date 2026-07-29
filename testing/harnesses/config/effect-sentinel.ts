import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";

import { compareAsciiStrings } from "@/lib/state-store";

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

async function observeCaughtAttempts(): Promise<readonly string[]> {
  try {
    await writeFile(CANARY_PATH, CANARY_PATH);
  } catch {
    // The trap records the attempt before the simulated denial is caught.
  }
  try {
    spawnSync(process.execPath, ["--version"]);
  } catch {
    // The trap records the attempt before the simulated denial is caught.
  }
  const observed = [...attemptedEffects];
  attemptedEffects.length = 0;
  return observed;
}

function changedEnvironmentKeys(
  before: Readonly<Record<string, string | undefined>>,
  after: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key])
    .sort(compareAsciiStrings);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const { defaultsCommand } = await import("@/commands/config/defaults");
const { showCommand } = await import("@/commands/config/show");
const { validateCommand } = await import("@/commands/config/validate");
const { CONFIG_TEST_GENERATOR, sampleConfigTestValue } = await import(
  "@testing/generators/config/descriptors"
);
const { configCliDefaults, configCliDeps } = await import("@testing/harnesses/config/cli");

type ConfigEffectSentinelObservation = {
  readonly changedEnvironmentKeys: readonly string[];
  readonly cwdAfter: string;
  readonly cwdBefore: string;
  readonly handlerAttemptedEffects: readonly string[];
  readonly handlerErrors: readonly string[];
  readonly probeAttemptedEffects: readonly string[];
};

async function observeConfigHandlerEffects(): Promise<ConfigEffectSentinelObservation> {
  installEffectTraps();
  try {
    const probeAttemptedEffects = await observeCaughtAttempts();

    const cwdBefore = process.cwd();
    const environmentBefore = { ...process.env };
    const successfulDeps = configCliDeps({ ok: true, value: configCliDefaults() });
    const rejectedDeps = configCliDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    });

    const handlerErrors: string[] = [];
    for (
      const operation of [
        () => showCommand({}, successfulDeps),
        () => showCommand({ json: true }, successfulDeps),
        () => showCommand({}, rejectedDeps),
        () => validateCommand({}, successfulDeps),
        () => validateCommand({}, rejectedDeps),
        () => defaultsCommand({}, successfulDeps),
        () => defaultsCommand({ json: true }, successfulDeps),
      ]
    ) {
      try {
        await operation();
      } catch (error) {
        handlerErrors.push(errorMessage(error));
      }
    }

    const environmentAfter = { ...process.env };
    return {
      changedEnvironmentKeys: changedEnvironmentKeys(environmentBefore, environmentAfter),
      cwdAfter: process.cwd(),
      cwdBefore,
      handlerAttemptedEffects: [...attemptedEffects],
      handlerErrors,
      probeAttemptedEffects,
    };
  } finally {
    restoreEffectTraps();
  }
}

console.log(JSON.stringify(await observeConfigHandlerEffects()));
