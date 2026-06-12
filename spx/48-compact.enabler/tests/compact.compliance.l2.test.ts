/**
 * Compact decoupling and shared-resolution compliance against real git worktrees:
 * the stash resolves to one shared `.spx/sessions/<id>/` from both a root and a
 * linked worktree, never touches the session-queue directories, and the command
 * surface exposes only the runtime options.
 */
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { Command } from "commander";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CompactInvalidSessionIdError,
  compactResumeCommand,
  compactStashCommand,
  resolveCompactStashDir,
} from "@/commands/compact";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { parseStashRecord, stashRecordFilename } from "@/domains/compact";
import { defaultGitDependencies } from "@/git/root";
import { COMPACT_OPTION, COMPACT_SUBCOMMAND, compactDomain } from "@/interfaces/cli/compact";
import {
  arbitraryNodePath,
  arbitraryRuntimeId,
  arbitraryUnsafeSessionId,
  renderTranscript,
  sampleCompactTestValue,
} from "@testing/generators/compact/compact";
import { addDetachedLinkedWorktree, writeTranscriptFixture } from "@testing/harnesses/compact/compact";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("compact shared-resolution compliance", () => {
  it("resolves the same shared .spx/sessions/<id>/ from a linked worktree and the root worktree", async () => {
    await withGitWorktreeEnv(async (env) => {
      const linkedPath = await addDetachedLinkedWorktree(env);
      const sessionId = sampleCompactTestValue(arbitraryRuntimeId());
      const node = sampleCompactTestValue(arbitraryNodePath());
      const transcriptPath = await writeTranscriptFixture(
        linkedPath,
        renderTranscript({ hasFoundation: true, contextNodes: [node], escaped: false }),
      );

      const stashResult = await compactStashCommand({
        sessionId,
        transcriptPath,
        cwd: linkedPath,
        deps: defaultGitDependencies,
      });
      const resumeResult = await compactResumeCommand({
        sessionId,
        cwd: env.productDir,
        deps: defaultGitDependencies,
      });

      const sharedPath = join(
        realpathSync(env.productDir),
        DEFAULT_CONFIG.sessions.dir,
        sessionId,
        stashRecordFilename(1),
      );
      expect(stashResult.written).toBe(sharedPath);
      expect(existsSync(sharedPath)).toBe(true);
      expect(existsSync(join(linkedPath, DEFAULT_CONFIG.sessions.dir, sessionId))).toBe(false);
      expect(resumeResult.output).not.toBeNull();
      expect(parseStashRecord(resumeResult.output ?? "").active_node).toBe(node);
    });
  });

  it("never creates the session-queue directories under .spx/sessions/", async () => {
    await withGitWorktreeEnv(async (env) => {
      const sessionId = sampleCompactTestValue(arbitraryRuntimeId());
      const node = sampleCompactTestValue(arbitraryNodePath());
      const transcriptPath = await writeTranscriptFixture(
        env.productDir,
        renderTranscript({ hasFoundation: true, contextNodes: [node], escaped: false }),
      );

      await compactStashCommand({ sessionId, transcriptPath, cwd: env.productDir, deps: defaultGitDependencies });

      const base = join(realpathSync(env.productDir), DEFAULT_CONFIG.sessions.dir);
      for (const status of Object.values(DEFAULT_CONFIG.sessions.statusDirs)) {
        expect(existsSync(join(base, status))).toBe(false);
      }
    });
  });
});

describe("compact command-surface compliance", () => {
  it("exposes only the runtime options on the compact subcommands", () => {
    const program = new Command();
    compactDomain.register(program);

    const compactCmd = program.commands.find((command) => command.name() === compactDomain.name);
    expect(compactCmd).toBeDefined();

    const stash = compactCmd?.commands.find((command) => command.name() === COMPACT_SUBCOMMAND.STASH);
    const resume = compactCmd?.commands.find((command) => command.name() === COMPACT_SUBCOMMAND.RESUME);
    expect(stash?.options.map((option) => option.long).sort()).toEqual(
      [COMPACT_OPTION.SESSION_ID, COMPACT_OPTION.TRANSCRIPT].sort(),
    );
    expect(resume?.options.map((option) => option.long)).toEqual([COMPACT_OPTION.SESSION_ID]);
  });
});

describe("compact session-id safety compliance", () => {
  it("rejects any --session-id that would escape .spx/sessions/", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryUnsafeSessionId(), async (sessionId) => {
        await expect(resolveCompactStashDir({ sessionId })).rejects.toBeInstanceOf(CompactInvalidSessionIdError);
      }),
    );
  });
});
