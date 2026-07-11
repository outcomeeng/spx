import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "vitest";

import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const DOCUMENT_ENCODING = "utf8";
const DEFAULT_BRANCH = "main";
const CANONICAL_CHECKOUT_DIRECTORY = "product";
const LINKED_CHECKOUT_DIRECTORY = "linked";
const INITIAL_COMMIT_MESSAGE = "initialize occupancy fixture";
const SWITCH_SUBCOMMAND = "switch";
const FORCE_MOVE_FLAG = "-M";
const WORKTREE_ADD_SUBCOMMAND = "add";
const RELEASE_SECTION_END = /^#{1,3} [^#]/m;
const MAIN_CHECKOUT_RELEASE_HEADING = "### Releasing CLI-surface changes";
const README_RELEASE_HEADING = "## Publishing a Release";
const REQUIRED_RELEASE_COMMANDS = [
  "git pull --ff-only origin main",
  "git branch --show-current",
  "git merge-base --is-ancestor \"vX.Y.Z\" HEAD",
  "pnpm run build",
  "spx --version",
] as const;
const FORBIDDEN_RELEASE_COMMANDS = ["git switch --detach", "git checkout --detach", "git switch main"] as const;

type ReleaseGuide = {
  readonly path: string;
  readonly heading: string;
};

const RELEASE_GUIDES: readonly ReleaseGuide[] = [
  { path: "AGENTS.md", heading: MAIN_CHECKOUT_RELEASE_HEADING },
  { path: "CLAUDE.md", heading: MAIN_CHECKOUT_RELEASE_HEADING },
  { path: "README.md", heading: README_RELEASE_HEADING },
];

export async function assertMainCheckoutReleaseOccupancy(): Promise<void> {
  await assertReleaseGuidesPreserveMainOccupancy();
  await assertGitRejectsMainCheckoutInLinkedWorktree();
}

async function assertReleaseGuidesPreserveMainOccupancy(): Promise<void> {
  for (const guide of RELEASE_GUIDES) {
    const content = await readFile(join(process.cwd(), guide.path), DOCUMENT_ENCODING);
    const releaseSection = extractSection(content, guide.heading);

    expect(releaseSection, `${guide.path} release section`).toContain("canonical main checkout");
    for (const command of REQUIRED_RELEASE_COMMANDS) {
      expect(releaseSection, `${guide.path} release section`).toContain(command);
    }
    for (const command of FORBIDDEN_RELEASE_COMMANDS) {
      expect(releaseSection, `${guide.path} release section`).not.toContain(command);
    }
  }
}

async function assertGitRejectsMainCheckoutInLinkedWorktree(): Promise<void> {
  await withTempDir("spx-main-occupancy-", async (fixtureRoot) => {
    const canonicalCheckout = join(fixtureRoot, CANONICAL_CHECKOUT_DIRECTORY);
    const linkedCheckout = join(fixtureRoot, LINKED_CHECKOUT_DIRECTORY);
    await mkdir(canonicalCheckout);
    await runGit(canonicalCheckout, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(canonicalCheckout, [
      GIT_TEST_SUBCOMMANDS.CONFIG,
      GIT_TEST_CONFIG.EMAIL_KEY,
      GIT_TEST_CONFIG.EMAIL,
    ]);
    await runGit(canonicalCheckout, [
      GIT_TEST_SUBCOMMANDS.CONFIG,
      GIT_TEST_CONFIG.USER_NAME_KEY,
      GIT_TEST_CONFIG.USER_NAME,
    ]);
    await runGit(canonicalCheckout, [
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      INITIAL_COMMIT_MESSAGE,
    ]);
    await runGit(canonicalCheckout, [GIT_TEST_SUBCOMMANDS.BRANCH, FORCE_MOVE_FLAG, DEFAULT_BRANCH]);
    await runGit(canonicalCheckout, [
      GIT_TEST_SUBCOMMANDS.WORKTREE,
      WORKTREE_ADD_SUBCOMMAND,
      GIT_TEST_FLAGS.DETACH,
      linkedCheckout,
    ]);

    await expect(runGit(linkedCheckout, [SWITCH_SUBCOMMAND, DEFAULT_BRANCH])).rejects.toThrow(/already checked out/);
    await expect(readGit(canonicalCheckout, [GIT_TEST_SUBCOMMANDS.BRANCH, GIT_TEST_FLAGS.SHOW_CURRENT])).resolves
      .toBe(DEFAULT_BRANCH);
  });
}

function extractSection(content: string, heading: string): string {
  const sectionStart = content.indexOf(heading);
  expect(sectionStart, `${heading} heading`).toBeGreaterThanOrEqual(0);
  const sectionBodyStart = sectionStart + heading.length;
  const remaining = content.slice(sectionBodyStart);
  const nextHeadingOffset = remaining.search(RELEASE_SECTION_END);
  return nextHeadingOffset === -1 ? remaining : remaining.slice(0, nextHeadingOffset);
}
