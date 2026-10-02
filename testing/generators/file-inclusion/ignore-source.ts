import * as fc from "fast-check";

import { GIT_WORKTREE_TEST_GENERATOR } from "@testing/generators/git-worktree/git-worktree";

/** The git ignore sources an ignore-source worktree entry can be listed in. */
export const WORKTREE_ENTRY_IGNORE_SOURCE = {
  NONE: "none",
  GITIGNORE: "gitignore",
  NESTED_GITIGNORE: "nested-gitignore",
  INFO_EXCLUDE: "info-exclude",
  GLOBAL_EXCLUDES: "global-excludes",
} as const;

export type WorktreeEntryIgnoreSource =
  (typeof WORKTREE_ENTRY_IGNORE_SOURCE)[keyof typeof WORKTREE_ENTRY_IGNORE_SOURCE];

/** The forms a global gitignore location takes under Git's path semantics. */
export const GLOBAL_EXCLUDES_CONFIGURATION_FORM = {
  ABSOLUTE: "absolute",
  RELATIVE: "relative",
  TILDE: "tilde",
  EMPTY: "empty",
  XDG_DEFAULT: "xdg-default",
  HOME_DEFAULT: "home-default",
} as const;

export type GlobalExcludesConfigurationForm =
  (typeof GLOBAL_EXCLUDES_CONFIGURATION_FORM)[keyof typeof GLOBAL_EXCLUDES_CONFIGURATION_FORM];

export type IgnoreSourceOverrideCase = {
  readonly noIgnore: boolean;
  readonly noIgnoreVcs: boolean;
  readonly ignoreFilePresent: boolean;
};

export type IgnoreSourceWorktreeEntry = {
  readonly directory: string;
  readonly name: string;
  readonly tracked: boolean;
  readonly source: WorktreeEntryIgnoreSource;
  readonly listedInIgnoreFile: boolean;
};

export type IgnoreSourceTopLevelNames = {
  readonly ignoreFile: string;
  readonly globalExcludesFile: string;
  readonly added: string;
};

export type IgnoreSourceWorktreeState = {
  readonly entries: readonly IgnoreSourceWorktreeEntry[];
  readonly overrides: IgnoreSourceOverrideCase;
  readonly topLevelNames: IgnoreSourceTopLevelNames;
};

const BOOLEAN_DOMAIN = [false, true] as const;
const ENTRY_COUNT_MIN = 1;
const ENTRY_COUNT_MAX = 5;
const TOP_LEVEL_NAME_COUNT = 3;
const PATH_SEPARATOR = "/";

export function ignoreSourceEntryPath(entry: IgnoreSourceWorktreeEntry): string {
  return `${entry.directory}${PATH_SEPARATOR}${entry.name}`;
}

/** Every combination of the three structured override flags, with the ignore file present or absent. */
export function ignoreSourceOverrideDomain(): readonly IgnoreSourceOverrideCase[] {
  return BOOLEAN_DOMAIN.flatMap((noIgnore) =>
    BOOLEAN_DOMAIN.flatMap((noIgnoreVcs) =>
      BOOLEAN_DOMAIN.map((ignoreFilePresent) => ({ noIgnore, noIgnoreVcs, ignoreFilePresent }))
    )
  );
}

export function globalExcludesConfigurationForms(): readonly GlobalExcludesConfigurationForm[] {
  return Object.values(GLOBAL_EXCLUDES_CONFIGURATION_FORM);
}

function arbitraryOverrideCase(): fc.Arbitrary<IgnoreSourceOverrideCase> {
  return fc.record({
    noIgnore: fc.boolean(),
    noIgnoreVcs: fc.boolean(),
    ignoreFilePresent: fc.boolean(),
  });
}

function arbitraryWorktreeEntry(): fc.Arbitrary<IgnoreSourceWorktreeEntry> {
  return fc.record({
    directory: GIT_WORKTREE_TEST_GENERATOR.nestedDirectory(),
    name: GIT_WORKTREE_TEST_GENERATOR.gitignorePattern(),
    tracked: fc.boolean(),
    source: fc.constantFrom(...Object.values(WORKTREE_ENTRY_IGNORE_SOURCE)),
    listedInIgnoreFile: fc.boolean(),
  });
}

function arbitraryTopLevelNames(): fc.Arbitrary<IgnoreSourceTopLevelNames> {
  return fc
    .uniqueArray(GIT_WORKTREE_TEST_GENERATOR.gitignorePattern(), {
      minLength: TOP_LEVEL_NAME_COUNT,
      maxLength: TOP_LEVEL_NAME_COUNT,
    })
    .map(([ignoreFile, globalExcludesFile, added]) => ({ ignoreFile, globalExcludesFile, added }));
}

/**
 * A git worktree whose entries are tracked or untracked and listed in any one git ignore
 * source, plus a structured override request and distinct top-level file names.
 */
function arbitraryWorktreeState(): fc.Arbitrary<IgnoreSourceWorktreeState> {
  return fc.record({
    entries: fc.uniqueArray(arbitraryWorktreeEntry(), {
      minLength: ENTRY_COUNT_MIN,
      maxLength: ENTRY_COUNT_MAX,
      selector: ignoreSourceEntryPath,
    }),
    overrides: arbitraryOverrideCase(),
    topLevelNames: arbitraryTopLevelNames(),
  });
}

export const IGNORE_SOURCE_TEST_GENERATOR = {
  worktreeState: arbitraryWorktreeState,
} as const;
