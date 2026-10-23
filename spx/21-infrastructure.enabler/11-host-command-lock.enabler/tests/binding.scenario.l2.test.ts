/**
 * The pinned binding: it loads from the installed package under Node 24, takes a nonblocking
 * exclusive lock, reports busy to a second descriptor, and releases only at the last close of the
 * description an inheriting child keeps after its parent closes its own copy.
 */

import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { defaultLockBinding, NODE_MAJOR } from "@/lib/host-command-lock";
import { isAlive, waitUntil, withLockEnv } from "@testing/harnesses/host-command-lock/host-command-lock";

const READY_MARK = "ready";
const KEEP_ALIVE_SOURCE = `process.stdout.write('${READY_MARK}');setInterval(()=>{},1000)`;

describe("the pinned lock binding", () => {
  it("loads under Node 24 and holds, reports busy for, and releases at the last close an inherited lock", async () => {
    await withLockEnv(async (lock) => {
      const path = join(lock.dir, "binding.lock");
      const parentFd = openSync(path, "a+");
      const competitorFd = openSync(path, "a+");
      const taken = defaultLockBinding.tryLock(parentFd);
      const child = spawn(process.execPath, ["-e", KEEP_ALIVE_SOURCE], {
        stdio: ["ignore", "pipe", "inherit", parentFd],
      });
      let ready = false;
      child.stdout?.on("data", () => {
        ready = true;
      });
      await waitUntil(() => ready);

      closeSync(parentFd);
      const busyWhileChildLives = defaultLockBinding.tryLock(competitorFd);
      child.kill("SIGKILL");
      await waitUntil(() => !isAlive(child.pid as number));
      const takenAfterLastClose = defaultLockBinding.tryLock(competitorFd);
      closeSync(competitorFd);

      expect(Number(process.versions.node.split(".")[0])).toBe(NODE_MAJOR);
      expect(taken).toBe(true);
      expect(busyWhileChildLives).toBe(false);
      expect(takenAfterLastClose).toBe(true);
    });
  });
});
