/**
 * The supported real launch chains for the host command lock, and the process-table observations
 * the chain evidence uses: a guarded `vitest` run, a guarded shell script that runs its workers in
 * the foreground, a guarded `just` recipe, and a guarded `pytest -n 2` run.
 *
 * Every chain runs workers that record a heartbeat file per process id and exit once a stop file
 * appears, so a test observes worker activity and lifetime apart from descriptor possession.
 *
 * @module host-command-lock/testing/chains
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createHostCommandLock } from "@/lib/host-command-lock";
import {
  dilatedDeps,
  intervalStarted,
  intervalWorkload,
  type LockEnv,
  startSupervisor,
  type SupervisorRun,
  waitUntil,
} from "@testing/harnesses/host-command-lock/host-command-lock";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const CHAIN_TEMP_PREFIX = "host-command-lock-chain-";
const HEARTBEAT_PREFIX = "hb-";
const STOP_FILE = "stop";
const MARKER_ENV = "HOST_LOCK_MARKER_DIR";
const ACTIVITY_WINDOW_MS = 400;
const HEARTBEAT_MS = 40;
const WORKER_FILE = "worker.js";
const VITEST_TIMEOUT_MS = 120_000;
const PS_COMMAND = "ps";
const PS_ARGS = ["-A", "-o", "pid=,ppid="] as const;
const LSOF_COMMAND = "lsof";

const WORKER_SOURCE = `const fs=require('fs'),path=require('path');
const dir=process.env.${MARKER_ENV};
setInterval(()=>{
  if(fs.existsSync(path.join(dir,'${STOP_FILE}')))process.exit(0);
  fs.writeFileSync(path.join(dir,'${HEARTBEAT_PREFIX}'+process.pid),String(Date.now()));
},${HEARTBEAT_MS});
`;

const VITEST_SOURCE = `import {test} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
test('worker', () => new Promise<void>((resolve) => {
  const dir = process.env.${MARKER_ENV} as string;
  setInterval(() => {
    if (fs.existsSync(path.join(dir, '${STOP_FILE}'))) resolve();
    fs.writeFileSync(path.join(dir, '${HEARTBEAT_PREFIX}' + process.pid), String(Date.now()));
  }, ${HEARTBEAT_MS});
}), ${VITEST_TIMEOUT_MS});
`;

const PYTEST_SOURCE = `import os, time

def _work():
    d = os.environ["${MARKER_ENV}"]
    while not os.path.exists(os.path.join(d, "${STOP_FILE}")):
        with open(os.path.join(d, "${HEARTBEAT_PREFIX}" + str(os.getpid())), "w") as f:
            f.write(str(time.time()))
        time.sleep(${HEARTBEAT_MS / 1000})

def test_first():
    _work()

def test_second():
    _work()
`;

const SHELL_SOURCE = `#!/bin/sh\nnode ${WORKER_FILE}\n`;
const JUSTFILE_SOURCE = `run:\n    node ${WORKER_FILE}\n`;

export interface Chain {
  readonly name: string;
  /** Writes the chain's project files into `dir`. */
  prepare(dir: string): void;
  /** The guarded command's argv, run with `dir` as its working directory. */
  command(dir: string): readonly string[];
}

export const SUPPORTED_CHAINS: readonly Chain[] = [
  {
    name: "vitest",
    prepare: (dir) => writeFileSync(join(dir, "worker.test.ts"), VITEST_SOURCE),
    command: () => [join(process.cwd(), "node_modules", ".bin", "vitest"), "run", "--pool=forks"],
  },
  {
    name: "shell script",
    prepare: (dir) => {
      writeFileSync(join(dir, WORKER_FILE), WORKER_SOURCE);
      writeFileSync(join(dir, "run.sh"), SHELL_SOURCE);
    },
    command: () => ["sh", "run.sh"],
  },
  {
    name: "just recipe",
    prepare: (dir) => {
      writeFileSync(join(dir, WORKER_FILE), WORKER_SOURCE);
      writeFileSync(join(dir, "justfile"), JUSTFILE_SOURCE);
    },
    command: () => ["just", "run"],
  },
  {
    name: "pytest -n 2",
    prepare: (dir) => writeFileSync(join(dir, "test_worker.py"), PYTEST_SOURCE),
    command: () => ["pytest", "-n", "2", "-p", "no:cacheprovider"],
  },
];

/** Vitest envelope for a chain test: the runner's startup and a window pass over real processes. */
export const CHAIN_TEST_TIMEOUT_MS = 120_000;

const COMPETITOR_LABEL = "competitor";

/** The environment entry that points a chain's workers at their marker directory. */
export function chainEnv(dir: string): Record<string, string> {
  return { [MARKER_ENV]: dir };
}

export interface RunningChain {
  readonly supervisor: SupervisorRun;
  /** Waits until at least one worker of the chain is alive and active. */
  workersActive(): Promise<void>;
}

/** Prepares and starts one guarded chain; its workers run until the stop file appears. */
export function startChain(lock: LockEnv, chain: Chain, dir: string): RunningChain {
  chain.prepare(dir);
  const supervisor = startSupervisor(
    lock,
    { command: chain.command(dir), cwd: dir },
    { env: { ...lock.env, ...chainEnv(dir) } },
  );
  return {
    supervisor,
    workersActive: () => waitUntil(() => activeWorkerPids(dir).length > 0, CHAIN_TEST_TIMEOUT_MS),
  };
}

/** Starts a competing guarded command that records the instant it starts; resolves when it has run. */
export function startCompetitor(lock: LockEnv, dir: string): Promise<unknown> {
  return createHostCommandLock(dilatedDeps(lock.lockPath)).run({ command: intervalWorkload(dir, COMPETITOR_LABEL, 1) });
}

export function competitorStarted(dir: string): boolean {
  return intervalStarted(dir, COMPETITOR_LABEL);
}

/** Process ids whose heartbeat file changed within the activity window: workers alive and active. */
export function activeWorkerPids(dir: string): number[] {
  return readdirSync(dir)
    .filter((name) => name.startsWith(HEARTBEAT_PREFIX))
    .filter((name) => Date.now() - statSync(join(dir, name)).mtimeMs < ACTIVITY_WINDOW_MS)
    .map((name) => Number(name.slice(HEARTBEAT_PREFIX.length)));
}

/** Tells every worker of the chain to finish. */
export function stopWorkers(dir: string): void {
  writeFileSync(join(dir, STOP_FILE), "");
}

export function stopRequested(dir: string): boolean {
  return existsSync(join(dir, STOP_FILE));
}

interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
}

function processTable(): ProcessRow[] {
  return execFileSync(PS_COMMAND, [...PS_ARGS])
    .toString()
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .map(([pid, ppid]) => ({ pid, ppid }));
}

/** Every transitive child of `pid` in the process table. */
export function descendantPids(pid: number): number[] {
  const rows = processTable();
  const found: number[] = [];
  const queue = [pid];
  while (queue.length > 0) {
    const parent = queue.shift() as number;
    for (const row of rows) {
      if (row.ppid === parent && !found.includes(row.pid)) {
        found.push(row.pid);
        queue.push(row.pid);
      }
    }
  }
  return found;
}

/** The direct children of `pid`. */
export function childPids(pid: number): number[] {
  return processTable().filter((row) => row.ppid === pid).map((row) => row.pid);
}

/** Process ids that hold `path` open, as the operating system reports them. */
export function holdersOf(path: string): number[] {
  try {
    return execFileSync(LSOF_COMMAND, ["-t", "--", path]).toString().trim().split("\n").filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

/** A fresh directory that holds one chain's markers. */
export async function withChainDir<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  return withTempDir(CHAIN_TEMP_PREFIX, callback);
}
