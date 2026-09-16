import { mkdir, readFile, realpath } from "node:fs/promises";
import { join, parse } from "node:path";
import { pathToFileURL } from "node:url";

import { execa } from "execa";
import { build } from "tsup";

import { GIT_LS_FILES_COMMAND } from "@/lib/git/changed-paths";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { SPEC_CLI_ISOLATION } from "@testing/harnesses/spec/spec-cli-isolation-contract";
import { SPEC_CLI_NETWORK_GUARD_SOURCE_PATH } from "@testing/harnesses/spec/spec-cli-network-guard";

async function buildSpecCliNetworkGuard(isolationDir: string): Promise<string> {
  await build({
    bundle: true,
    clean: false,
    entry: {
      [parse(SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE).name]: SPEC_CLI_NETWORK_GUARD_SOURCE_PATH,
    },
    format: "esm",
    outDir: isolationDir,
    outExtension: () => ({ js: parse(SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE).ext }),
    silent: true,
    splitting: false,
    target: "node24",
  });
  return pathToFileURL(join(isolationDir, SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE)).href;
}

export async function runSpecCli(productDir: string, ...args: readonly string[]) {
  return (await runSpecCliWithIsolation(productDir, ...args)).result;
}

type SpecCliIsolation = {
  readonly env: Record<string, string>;
  readonly nodeArgs: readonly string[];
  readonly networkAttemptsFile: string;
  readonly writableProductDir: string;
};

async function createSpecCliIsolation(productDir: string): Promise<SpecCliIsolation> {
  const isolationDir = join(productDir, SPEC_CLI_ISOLATION.DIRECTORY);
  const homeDir = join(isolationDir, SPEC_CLI_ISOLATION.HOME_DIRECTORY);
  const tempDir = join(isolationDir, SPEC_CLI_ISOLATION.TEMP_DIRECTORY);
  const xdgCacheDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_CACHE_DIRECTORY);
  const xdgConfigDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_CONFIG_DIRECTORY);
  const xdgDataDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_DATA_DIRECTORY);
  const xdgStateDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_STATE_DIRECTORY);
  const mutableStateDirectories = [homeDir, tempDir, xdgCacheDir, xdgConfigDir, xdgDataDir, xdgStateDir];
  const networkAttemptsFile = join(isolationDir, SPEC_CLI_ISOLATION.NETWORK_ATTEMPTS_FILE);
  await Promise.all(
    mutableStateDirectories.map((path) => mkdir(path, { recursive: true })),
  );
  const networkGuardModule = await buildSpecCliNetworkGuard(isolationDir);
  const writableProductDir = await realpath(productDir);
  return {
    env: {
      HOME: homeDir,
      PATH: process.env.PATH as string,
      [SPEC_CLI_ISOLATION.GIT_EXECUTABLE_ENV]: GIT_ROOT_COMMAND.EXECUTABLE,
      [SPEC_CLI_ISOLATION.GIT_READ_SUBCOMMANDS_ENV]: JSON.stringify([
        GIT_ROOT_COMMAND.REV_PARSE,
        GIT_LS_FILES_COMMAND,
      ]),
      [SPEC_CLI_ISOLATION.NETWORK_ATTEMPTS_ENV]: networkAttemptsFile,
      TEMP: tempDir,
      TMP: tempDir,
      TMPDIR: tempDir,
      XDG_CACHE_HOME: xdgCacheDir,
      XDG_CONFIG_HOME: xdgConfigDir,
      XDG_DATA_HOME: xdgDataDir,
      XDG_STATE_HOME: xdgStateDir,
    },
    nodeArgs: [
      "--no-warnings",
      "--permission",
      "--allow-fs-read=*",
      `--allow-fs-write=${productDir}`,
      `--allow-fs-write=${writableProductDir}`,
      "--allow-child-process",
      "--allow-worker",
      "--import",
      networkGuardModule,
    ],
    networkAttemptsFile,
    writableProductDir,
  };
}

async function runIsolatedNodeEntry(
  productDir: string,
  isolation: SpecCliIsolation,
  entryArgs: readonly string[],
  extraEnv?: Record<string, string>,
) {
  return execa(
    NODE_EXECUTABLE,
    [...isolation.nodeArgs, ...entryArgs],
    {
      cwd: productDir,
      env: { ...isolation.env, ...extraEnv },
      extendEnv: false,
      reject: false,
    },
  );
}

export async function runSpecCliWithIsolation(productDir: string, ...args: readonly string[]) {
  return runSpecCliWithIsolationInEnv(productDir, {}, ...args);
}

/** Runs the built CLI under the isolation contract with the supplied variables added to the isolated environment. */
export async function runSpecCliWithIsolationInEnv(
  productDir: string,
  extraEnv: Readonly<Record<string, string>>,
  ...args: readonly string[]
) {
  const isolation = await createSpecCliIsolation(productDir);
  const result = await runIsolatedNodeEntry(productDir, isolation, [CLI_PATH, ...args], { ...extraEnv });
  const networkAttempts = JSON.parse(await readFile(isolation.networkAttemptsFile, "utf8")) as readonly unknown[];
  return {
    networkAttempts,
    productDirectory: isolation.writableProductDir,
    result,
  };
}

const NETWORK_ATTEMPT_PROBE_SCRIPT = "require(\"node:http\").get(\"http://127.0.0.1:1/\");";
const ESCAPE_WRITE_PROBE_SCRIPT =
  `require("node:fs").writeFileSync(process.env.${SPEC_CLI_ISOLATION.ESCAPE_PROBE_PATH_ENV}, "escape");`;

/**
 * Violating fixture for the network-isolation boundary: an isolated
 * subprocess that attempts one outbound HTTP request under the same guard,
 * environment, and permission flags the CLI runs with. The recorded attempts
 * and exit result are observations for the executed test to judge.
 */
export async function runIsolatedNetworkAttemptProbe(productDir: string) {
  const isolation = await createSpecCliIsolation(productDir);
  const result = await runIsolatedNodeEntry(productDir, isolation, ["-e", NETWORK_ATTEMPT_PROBE_SCRIPT]);
  const networkAttempts = JSON.parse(await readFile(isolation.networkAttemptsFile, "utf8")) as readonly unknown[];
  return { networkAttempts, result };
}

/**
 * Violating fixture for the mutable-state boundary: an isolated subprocess
 * that attempts one write to a sibling of the product directory — a path
 * outside every allow-fs-write grant. The exit result and the escape file's
 * existence are observations for the executed test to judge.
 */
export async function runIsolatedEscapeWriteProbe(productDir: string) {
  const isolation = await createSpecCliIsolation(productDir);
  const escapeFilePath = `${isolation.writableProductDir}-escape.txt`;
  const result = await runIsolatedNodeEntry(productDir, isolation, ["-e", ESCAPE_WRITE_PROBE_SCRIPT], {
    [SPEC_CLI_ISOLATION.ESCAPE_PROBE_PATH_ENV]: escapeFilePath,
  });
  let escapeFileExists = true;
  try {
    await readFile(escapeFilePath);
  } catch {
    escapeFileExists = false;
  }
  return { escapeFileExists, escapeFilePath, result };
}

export const METHODOLOGY_FIXTURE_VERSION = "4.0.0";
