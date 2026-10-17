import { join } from "node:path";

import * as fc from "fast-check";

import { READ_ENTRY_POINTS } from "@/test/languages/read-recorder-install";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

/** The kinds of step a generated read plan performs. */
export const READ_STEP = {
  CHDIR: "chdir",
  READ: "read",
} as const;

/** The encoding option a generated read passes, or none. */
export const READ_ENCODING = {
  TEXT: "utf8",
  NONE: undefined,
} as const;
export type ReadEncoding = (typeof READ_ENCODING)[keyof typeof READ_ENCODING];

type ReadEntryPointValue = (typeof READ_ENTRY_POINTS)[number];

/** A step that moves the working directory to one of the plan's locations; location 0 is the plan's root. */
export interface ChdirStep {
  readonly kind: typeof READ_STEP.CHDIR;
  readonly location: number;
}

/** What a generated read names: a regular file, a symbolic link to a file, or a path that resolves to no file. */
export const READ_PATH_KIND = {
  FILE: "file",
  LINK: "link",
  UNRESOLVED: "unresolved",
} as const;
export type ReadPathKind = (typeof READ_PATH_KIND)[keyof typeof READ_PATH_KIND];

/**
 * A step that reads one of the plan's paths, named relative to the working directory, through one
 * entry point. `file` indexes the plan's files and, for a link read, the link that points at that file.
 */
export interface ReadStep {
  readonly kind: typeof READ_STEP.READ;
  readonly entryPoint: ReadEntryPointValue;
  readonly pathKind: ReadPathKind;
  readonly file: number;
}

export type PlanStep = ChdirStep | ReadStep;

/**
 * A generated world and the reads performed in it: every location (the root and each named
 * directory under it) holds every file name, a symbolic link to each file under the link name
 * at the same index, and no entry under the unresolved name; the steps move the working
 * directory and read paths by their names relative to it.
 */
export interface GeneratedReadPlan {
  readonly directories: readonly string[];
  readonly files: readonly string[];
  readonly links: readonly string[];
  readonly unresolvedName: string;
  readonly steps: readonly PlanStep[];
}

/** A file to read through an entry point: its name and content. */
export interface GeneratedReadCase {
  readonly fileName: string;
  readonly content: string;
}

/** The name a read step addresses relative to the working directory, by the kind of path it reads. */
export function readStepName(plan: GeneratedReadPlan, step: ReadStep): string {
  if (step.pathKind === READ_PATH_KIND.LINK) return plan.links[step.file];
  if (step.pathKind === READ_PATH_KIND.UNRESOLVED) return plan.unresolvedName;
  return plan.files[step.file];
}

const MIN_DIRECTORIES = 1;
const MAX_DIRECTORIES = 3;
const MIN_FILES = 1;
const MAX_FILES = 3;
const MAX_STEPS = 12;
const ROOT_LOCATION = 0;

/**
 * The directory, relative to the plan's root, a location names: the root for location 0, and the
 * location's named directory otherwise.
 */
export function locationDirectory(plan: GeneratedReadPlan, location: number): string {
  return location === ROOT_LOCATION ? "" : plan.directories[location - 1];
}

/**
 * The sorted unique absolute paths a plan's reads open when the plan runs in `root`: each read
 * resolves its name against the working directory the preceding chdir steps set, which this
 * construction tracks from the plan alone. A read of a regular file and a read of a link to it
 * open the same file, and a read of a path that resolves to no file opens none. `undefined` when
 * the plan opens no file.
 */
export function expectedRecordedPaths(root: string, plan: GeneratedReadPlan): string[] | undefined {
  const opened = new Set<string>();
  let location = ROOT_LOCATION;
  for (const step of plan.steps) {
    if (step.kind === READ_STEP.CHDIR) {
      location = step.location;
    } else if (step.pathKind !== READ_PATH_KIND.UNRESOLVED) {
      opened.add(join(root, locationDirectory(plan, location), plan.files[step.file]));
    }
  }
  return opened.size === 0 ? undefined : [...opened].sort((left, right) => left.localeCompare(right));
}

function arbitraryReadPlan(): fc.Arbitrary<GeneratedReadPlan> {
  return fc
    .record({
      directoryCount: fc.integer({ min: MIN_DIRECTORIES, max: MAX_DIRECTORIES }),
      fileCount: fc.integer({ min: MIN_FILES, max: MAX_FILES }),
    })
    .chain(({ directoryCount, fileCount }) => {
      const nameCount = directoryCount + 2 * fileCount + 1;
      return fc
        .uniqueArray(arbitraryDomainLiteral(), { minLength: nameCount, maxLength: nameCount })
        .chain((names) => {
          const directories = names.slice(0, directoryCount);
          const files = names.slice(directoryCount, directoryCount + fileCount);
          const links = names.slice(directoryCount + fileCount, directoryCount + 2 * fileCount);
          const unresolvedName = names[nameCount - 1];
          const chdirStep: fc.Arbitrary<PlanStep> = fc.record({
            kind: fc.constant(READ_STEP.CHDIR),
            location: fc.integer({ min: ROOT_LOCATION, max: directories.length }),
          });
          const readStep: fc.Arbitrary<PlanStep> = fc.record({
            kind: fc.constant(READ_STEP.READ),
            entryPoint: fc.constantFrom(...READ_ENTRY_POINTS),
            pathKind: fc.constantFrom(...Object.values(READ_PATH_KIND)),
            file: fc.integer({ min: 0, max: files.length - 1 }),
          });
          return fc
            .array(fc.oneof(chdirStep, readStep), { maxLength: MAX_STEPS })
            .map((steps) => ({ directories, files, links, unresolvedName, steps }));
        });
    });
}

function arbitraryReadCase(): fc.Arbitrary<GeneratedReadCase> {
  return fc.record({
    fileName: arbitraryDomainLiteral(),
    content: arbitraryDomainLiteral(),
  });
}

/**
 * A value `node:fs` rejects as a read target: no value, a null, a non-file URL, or a boolean.
 * The original function raises its own error for each; the recorder derives no path from any.
 */
function arbitraryInvalidReadTarget(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.webUrl().map((url) => new URL(url)),
    fc.boolean(),
  );
}

export const READ_RECORDER_GENERATOR = {
  /**
   * A world of directories, files, links to the files, and an unresolved name, with a sequence of
   * working-directory changes and reads of a file, a link, or the unresolved path, repeated reads included.
   */
  readPlan: arbitraryReadPlan,
  /** One file to read. */
  readCase: arbitraryReadCase,
  /** A value that is not a valid read target. */
  invalidReadTarget: arbitraryInvalidReadTarget,
} as const;
