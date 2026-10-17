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

/** A step that reads one of the plan's files, named relative to the working directory, through one entry point. */
export interface ReadStep {
  readonly kind: typeof READ_STEP.READ;
  readonly entryPoint: ReadEntryPointValue;
  readonly file: number;
}

export type PlanStep = ChdirStep | ReadStep;

/**
 * A generated world and the reads performed in it: every location (the root and each named
 * directory under it) holds every file name, and the steps move the working directory and read
 * files by their names relative to it.
 */
export interface GeneratedReadPlan {
  readonly directories: readonly string[];
  readonly files: readonly string[];
  readonly steps: readonly PlanStep[];
}

/** A file to read through an entry point: its name, content, and the encoding option the read passes. */
export interface GeneratedReadCase {
  readonly fileName: string;
  readonly content: string;
  readonly encoding: ReadEncoding;
}

const MIN_NAMES = 3;
const MAX_NAMES = 6;
const MIN_DIRECTORIES = 1;
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
 * resolves its file name against the working directory the preceding chdir steps set, which this
 * construction tracks from the plan alone. `undefined` when the plan reads no file.
 */
export function expectedRecordedPaths(root: string, plan: GeneratedReadPlan): string[] | undefined {
  const opened = new Set<string>();
  let location = ROOT_LOCATION;
  for (const step of plan.steps) {
    if (step.kind === READ_STEP.CHDIR) {
      location = step.location;
    } else {
      opened.add(join(root, locationDirectory(plan, location), plan.files[step.file]));
    }
  }
  return opened.size === 0 ? undefined : [...opened].sort((left, right) => left.localeCompare(right));
}

function arbitraryReadPlan(): fc.Arbitrary<GeneratedReadPlan> {
  return fc
    .uniqueArray(arbitraryDomainLiteral(), { minLength: MIN_NAMES, maxLength: MAX_NAMES })
    .chain((names) =>
      fc.integer({ min: MIN_DIRECTORIES, max: names.length - MIN_DIRECTORIES }).chain((directoryCount) => {
        const directories = names.slice(0, directoryCount);
        const files = names.slice(directoryCount);
        const chdirStep: fc.Arbitrary<PlanStep> = fc.record({
          kind: fc.constant(READ_STEP.CHDIR),
          location: fc.integer({ min: ROOT_LOCATION, max: directories.length }),
        });
        const readStep: fc.Arbitrary<PlanStep> = fc.record({
          kind: fc.constant(READ_STEP.READ),
          entryPoint: fc.constantFrom(...READ_ENTRY_POINTS),
          file: fc.integer({ min: 0, max: files.length - 1 }),
        });
        return fc
          .array(fc.oneof(chdirStep, readStep), { maxLength: MAX_STEPS })
          .map((steps) => ({ directories, files, steps }));
      })
    );
}

/** The three distinct names of a world holding a file, a symbolic link to it, and a path that names nothing. */
export interface GeneratedUnresolvedPathNames {
  readonly targetName: string;
  readonly linkName: string;
  readonly missingName: string;
}

function arbitraryUnresolvedPathNames(): fc.Arbitrary<GeneratedUnresolvedPathNames> {
  return fc
    .uniqueArray(arbitraryDomainLiteral(), { minLength: 3, maxLength: 3 })
    .map(([targetName, linkName, missingName]) => ({ targetName, linkName, missingName }));
}

function arbitraryReadCase(): fc.Arbitrary<GeneratedReadCase> {
  return fc.record({
    fileName: arbitraryDomainLiteral(),
    content: arbitraryDomainLiteral(),
    encoding: fc.constantFrom(READ_ENCODING.TEXT, READ_ENCODING.NONE),
  });
}

export const READ_RECORDER_GENERATOR = {
  /** A world of directories and files with a sequence of working-directory changes and reads, repeated reads included. */
  readPlan: arbitraryReadPlan,
  /** Distinct names for a file, a symbolic link to it, and a path that resolves to no file. */
  unresolvedPathNames: arbitraryUnresolvedPathNames,
  /** One file to read with a generated encoding option. */
  readCase: arbitraryReadCase,
} as const;
