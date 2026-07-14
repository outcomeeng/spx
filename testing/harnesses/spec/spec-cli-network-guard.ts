import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

import { SPEC_CLI_ISOLATION } from "./spec-cli-isolation-contract";

if (process.permission.has("net")) {
  throw new Error("Spec CLI contract process unexpectedly has network permission");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (value === undefined) throw new Error(`Spec CLI contract process is missing ${name}`);
  return value;
}

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!isStringArray(parsed)) {
    throw new Error("Spec CLI contract process received invalid Git read subcommands");
  }
  return parsed;
}

const gitExecutable = requiredEnvironmentValue(SPEC_CLI_ISOLATION.GIT_EXECUTABLE_ENV);
const gitReadSubcommands = parseStringArray(
  requiredEnvironmentValue(SPEC_CLI_ISOLATION.GIT_READ_SUBCOMMANDS_ENV),
);

function assertReadOnlyGitProbe(argumentsList: unknown[]): void {
  const [command, args] = argumentsList;
  if (
    command === gitExecutable
    && isStringArray(args)
    && gitReadSubcommands.includes(args[0])
  ) {
    return;
  }
  throw new Error("Spec CLI contract process attempted an unsupported child process");
}

function rejectChildProcess(): never {
  throw new Error("Spec CLI contract process attempted an unsupported child process API");
}

Object.defineProperty(childProcess, "spawn", {
  configurable: true,
  value: new Proxy(childProcess.spawn, {
    apply(target, thisArgument, argumentsList) {
      assertReadOnlyGitProbe(argumentsList);
      return Reflect.apply(target, thisArgument, argumentsList);
    },
  }),
});
for (const method of ["exec", "execFile", "execFileSync", "execSync", "fork", "spawnSync"] as const) {
  Object.defineProperty(childProcess, method, {
    configurable: true,
    value: rejectChildProcess,
  });
}
syncBuiltinESMExports();
