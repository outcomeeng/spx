/**
 * Compact command handlers against a real git worktree and a real filesystem:
 * stash writes numbered records, no-ops without a foundation marker, and resume
 * returns the most recent record. Real `git` + temp dirs (command-layer integration).
 */
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { compactResumeCommand, compactStashCommand } from "@/commands/compact";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { parseStashRecord, stashRecordFilename } from "@/domains/compact";
import { defaultGitDependencies, NOT_GIT_REPO_WARNING } from "@/git/root";
import {
  arbitraryNodePath,
  arbitraryRuntimeId,
  renderTranscript,
  sampleCompactTestValue,
} from "@testing/generators/compact/compact";
import { writeTranscriptFixture } from "@testing/harnesses/compact/compact";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

function stashDirOf(productDir: string, sessionId: string): string {
  return join(productDir, DEFAULT_CONFIG.sessions.dir, sessionId);
}

async function readRecordAt(path: string): Promise<unknown> {
  return parseStashRecord((await readFile(path)).toString());
}

describe("compact stash command", () => {
  it("writes the first numbered record from a foundation-bearing transcript", async () => {
    await withGitWorktreeEnv(async (env) => {
      const sessionId = sampleCompactTestValue(arbitraryRuntimeId());
      const node = sampleCompactTestValue(arbitraryNodePath());
      const transcriptPath = await writeTranscriptFixture(
        env.productDir,
        renderTranscript({ hasFoundation: true, contextNodes: [node], escaped: false }),
      );

      const result = await compactStashCommand({
        sessionId,
        transcriptPath,
        cwd: env.productDir,
        deps: defaultGitDependencies,
      });

      const expectedPath = join(stashDirOf(realpathSync(env.productDir), sessionId), stashRecordFilename(1));
      expect(result.written).toBe(expectedPath);
      expect(await readRecordAt(expectedPath)).toEqual({ active_node: node, has_foundation: true });
    });
  });

  it("no-ops without creating the stash directory when no foundation marker is present", async () => {
    await withGitWorktreeEnv(async (env) => {
      const sessionId = sampleCompactTestValue(arbitraryRuntimeId());
      const node = sampleCompactTestValue(arbitraryNodePath());
      const transcriptPath = await writeTranscriptFixture(
        env.productDir,
        renderTranscript({ hasFoundation: false, contextNodes: [node], escaped: false }),
      );

      const result = await compactStashCommand({
        sessionId,
        transcriptPath,
        cwd: env.productDir,
        deps: defaultGitDependencies,
      });

      expect(result.written).toBeNull();
      expect(existsSync(stashDirOf(realpathSync(env.productDir), sessionId))).toBe(false);
    });
  });

  it("appends a new numbered record on each foundation-bearing invocation without overwriting", async () => {
    await withGitWorktreeEnv(async (env) => {
      const sessionId = sampleCompactTestValue(arbitraryRuntimeId());
      const [firstNode, secondNode] = sampleCompactTestValue(fc.tuple(arbitraryNodePath(), arbitraryNodePath()));

      const firstResult = await compactStashCommand({
        sessionId,
        transcriptPath: await writeTranscriptFixture(
          env.productDir,
          renderTranscript({ hasFoundation: true, contextNodes: [firstNode], escaped: false }),
        ),
        cwd: env.productDir,
        deps: defaultGitDependencies,
      });
      const secondResult = await compactStashCommand({
        sessionId,
        transcriptPath: await writeTranscriptFixture(
          env.productDir,
          renderTranscript({ hasFoundation: true, contextNodes: [secondNode], escaped: false }),
        ),
        cwd: env.productDir,
        deps: defaultGitDependencies,
      });

      const dir = stashDirOf(realpathSync(env.productDir), sessionId);
      expect(firstResult.written).toBe(join(dir, stashRecordFilename(1)));
      expect(secondResult.written).toBe(join(dir, stashRecordFilename(2)));
      expect(await readRecordAt(join(dir, stashRecordFilename(1)))).toEqual({
        active_node: firstNode,
        has_foundation: true,
      });
    });
  });

  it("surfaces the non-git-repo fallback warning when run outside a repository", async () => {
    const outsideRepoDir = await createTempDir("spx-compact-nongit-");
    try {
      const sessionId = sampleCompactTestValue(arbitraryRuntimeId());
      const node = sampleCompactTestValue(arbitraryNodePath());
      const transcriptPath = await writeTranscriptFixture(
        outsideRepoDir,
        renderTranscript({ hasFoundation: true, contextNodes: [node], escaped: false }),
      );

      const result = await compactStashCommand({
        sessionId,
        transcriptPath,
        cwd: outsideRepoDir,
        deps: defaultGitDependencies,
      });

      expect(result.warning).toBe(NOT_GIT_REPO_WARNING);
      expect(result.written).not.toBeNull();
    } finally {
      await removeTempDir(outsideRepoDir);
    }
  });
});

describe("compact resume command", () => {
  it("returns the most recent stash record as JSON", async () => {
    await withGitWorktreeEnv(async (env) => {
      const sessionId = sampleCompactTestValue(arbitraryRuntimeId());
      const [firstNode, secondNode] = sampleCompactTestValue(fc.tuple(arbitraryNodePath(), arbitraryNodePath()));
      for (const node of [firstNode, secondNode]) {
        await compactStashCommand({
          sessionId,
          transcriptPath: await writeTranscriptFixture(
            env.productDir,
            renderTranscript({ hasFoundation: true, contextNodes: [node], escaped: false }),
          ),
          cwd: env.productDir,
          deps: defaultGitDependencies,
        });
      }

      const result = await compactResumeCommand({ sessionId, cwd: env.productDir, deps: defaultGitDependencies });

      expect(result.output).not.toBeNull();
      expect(parseStashRecord(result.output ?? "")).toEqual({ active_node: secondNode, has_foundation: true });
    });
  });

  it("returns null when no stash record exists", async () => {
    await withGitWorktreeEnv(async (env) => {
      const sessionId = sampleCompactTestValue(arbitraryRuntimeId());

      const result = await compactResumeCommand({ sessionId, cwd: env.productDir, deps: defaultGitDependencies });

      expect(result.output).toBeNull();
    });
  });
});
