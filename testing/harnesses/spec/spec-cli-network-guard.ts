import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { writeFileSync } from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

import { SPEC_CLI_ISOLATION } from "./spec-cli-isolation-contract";

const NETWORK_MODULE_METHODS = {
  DATAGRAM: ["createSocket"],
  DNS: [
    "lookup",
    "lookupService",
    "resolve",
    "resolve4",
    "resolve6",
    "resolveAny",
    "resolveCaa",
    "resolveCname",
    "resolveMx",
    "resolveNaptr",
    "resolveNs",
    "resolvePtr",
    "resolveSoa",
    "resolveSrv",
    "resolveTxt",
    "reverse",
  ],
  HTTP: ["get", "request"],
  HTTP2: ["connect"],
  NET: ["connect", "createConnection"],
  TLS: ["connect"],
} as const;

const NETWORK_GLOBALS = ["EventSource", "WebSocket"] as const;
const LOCAL_FETCH_PROTOCOLS = ["data:", "file:"] as const;

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

type NetworkAttempt = {
  readonly label: string;
  readonly stack: string | undefined;
};

export const SPEC_CLI_NETWORK_GUARD_SOURCE_PATH = fileURLToPath(import.meta.url);

export function installSpecCliNetworkGuard(): void {
  const gitExecutable = requiredEnvironmentValue(SPEC_CLI_ISOLATION.GIT_EXECUTABLE_ENV);
  const gitReadSubcommands = parseStringArray(
    requiredEnvironmentValue(SPEC_CLI_ISOLATION.GIT_READ_SUBCOMMANDS_ENV),
  );
  const networkAttemptsFile = requiredEnvironmentValue(SPEC_CLI_ISOLATION.NETWORK_ATTEMPTS_ENV);
  const networkAttempts: NetworkAttempt[] = [];
  const rejectNetworkAttempt = (label: string): never => {
    networkAttempts.push({ label, stack: new Error().stack });
    throw new Error(`Spec CLI contract process attempted network access through ${label}`);
  };
  const networkGuard = (label: string): () => never => () => rejectNetworkAttempt(label);
  const installNetworkGuard = (target: object, namespace: string, methodNames: readonly string[]): void => {
    for (const methodName of methodNames) {
      if (typeof Reflect.get(target, methodName) !== "function") continue;
      Object.defineProperty(target, methodName, {
        configurable: true,
        value: networkGuard(`${namespace}.${methodName}`),
      });
    }
  };

  process.on("exit", () => {
    writeFileSync(networkAttemptsFile, JSON.stringify(networkAttempts), "utf8");
  });

  installNetworkGuard(dgram, "dgram", NETWORK_MODULE_METHODS.DATAGRAM);
  installNetworkGuard(dns, "dns", NETWORK_MODULE_METHODS.DNS);
  installNetworkGuard(dns.promises, "dns.promises", NETWORK_MODULE_METHODS.DNS);
  installNetworkGuard(dnsPromises, "dns/promises", NETWORK_MODULE_METHODS.DNS);
  installNetworkGuard(dns.Resolver.prototype, "dns.Resolver", NETWORK_MODULE_METHODS.DNS);
  installNetworkGuard(dnsPromises.Resolver.prototype, "dns/promises.Resolver", NETWORK_MODULE_METHODS.DNS);
  installNetworkGuard(http, "http", NETWORK_MODULE_METHODS.HTTP);
  installNetworkGuard(https, "https", NETWORK_MODULE_METHODS.HTTP);
  installNetworkGuard(http2, "http2", NETWORK_MODULE_METHODS.HTTP2);
  installNetworkGuard(net, "net", NETWORK_MODULE_METHODS.NET);
  installNetworkGuard(net.Socket.prototype, "net.Socket", ["connect"]);
  installNetworkGuard(tls, "tls", NETWORK_MODULE_METHODS.TLS);
  installNetworkGuard(tls.TLSSocket.prototype, "tls.TLSSocket", ["connect"]);
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
      const input = args[0];
      const target = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
      if (LOCAL_FETCH_PROTOCOLS.includes(new URL(target).protocol as (typeof LOCAL_FETCH_PROTOCOLS)[number])) {
        return originalFetch(...args);
      }
      return rejectNetworkAttempt("globalThis.fetch");
    },
    writable: false,
  });
  for (const globalName of NETWORK_GLOBALS) {
    if (typeof Reflect.get(globalThis, globalName) !== "function") continue;
    Object.defineProperty(globalThis, globalName, {
      configurable: true,
      value: networkGuard(`globalThis.${globalName}`),
      writable: false,
    });
  }

  const assertReadOnlyGitProbe = (argumentsList: unknown[]): void => {
    const [command, args] = argumentsList;
    if (
      command === gitExecutable
      && isStringArray(args)
      && gitReadSubcommands.includes(args[0])
    ) {
      return;
    }
    throw new Error("Spec CLI contract process attempted an unsupported child process");
  };
  const rejectChildProcess = (): never => {
    throw new Error("Spec CLI contract process attempted an unsupported child process API");
  };

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
}

if (process.env[SPEC_CLI_ISOLATION.NETWORK_ATTEMPTS_ENV] !== undefined) {
  installSpecCliNetworkGuard();
}
