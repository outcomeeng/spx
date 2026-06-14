import * as fc from "fast-check";

import { PRECOMMIT_DEFAULTS, type PrecommitConfig } from "@/lib/precommit/config";

export const PRECOMMIT_TEST_GENERATOR = {
  config: arbitraryPrecommitConfig,
  exitCode: arbitraryNonSuccessExitCode,
  fileList: arbitraryFileList,
  path: arbitraryPath,
  pathSegment: arbitraryPathSegment,
  pathFragment: arbitraryPathFragment,
  posixDirectoryPrefix: arbitraryPosixDirectoryPrefix,
  windowsDirectoryPrefix: arbitraryWindowsDirectoryPrefix,
  sourcePath: arbitrarySourcePath,
  testPath: arbitraryTestPath,
  otherPath: arbitraryOtherPath,
} as const;

export const PRECOMMIT_TEST_FIXTURE = {
  FAILING_TEST_NAME: "intentionally fails to test pre-commit blocking",
  PASSING_TEST_NAME: "correctly tests addition",
} as const;

export function samplePrecommitTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) throw new Error("Precommit test generator returned no sample");
  return value;
}

function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9-]{2,12}$/);
}

function arbitraryPathFragment(): fc.Arbitrary<string> {
  return fc.array(arbitraryPathSegment(), { maxLength: 3 }).map((segments) => segments.join("/"));
}

function arbitraryPosixDirectoryPrefix(): fc.Arbitrary<string> {
  return fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: 4 }).map((segments) => `/${segments.join("/")}`);
}

function arbitraryWindowsDirectoryPrefix(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryPathSegment(), { minLength: 1, maxLength: 4 })
    .map((segments) => `C:\\${segments.join("\\")}`);
}

function arbitraryPrecommitConfig(): fc.Arbitrary<PrecommitConfig> {
  return fc
    .record({
      sourceDirs: fc.uniqueArray(
        arbitraryPathSegment().map((seg) => `${seg}/`),
        { minLength: 1, maxLength: 3 },
      ),
      testPattern: arbitraryPathSegment().map((seg) => `.${seg}.ts`),
    })
    .filter(({ sourceDirs, testPattern }) =>
      sourceDirs.every((dir) => !dir.includes(testPattern) && !testPattern.includes(dir))
    );
}

function arbitrarySourcePath(config: PrecommitConfig = PRECOMMIT_DEFAULTS): fc.Arbitrary<string> {
  return fc
    .record({
      dir: fc.constantFrom(...config.sourceDirs),
      slug: arbitraryPathSegment(),
    })
    .map(({ dir, slug }) => `${dir}${slug}.ts`)
    .filter((path) => !path.includes(config.testPattern));
}

function arbitraryTestPath(config: PrecommitConfig = PRECOMMIT_DEFAULTS): fc.Arbitrary<string> {
  return arbitraryPathSegment().map((slug) => `spx/${slug}.enabler/tests/${slug}${config.testPattern}`);
}

function arbitraryOtherPath(config: PrecommitConfig = PRECOMMIT_DEFAULTS): fc.Arbitrary<string> {
  return arbitraryPathSegment()
    .map((slug) => `${slug}.md`)
    .filter((path) => !path.includes(config.testPattern) && !config.sourceDirs.some((d) => path.startsWith(d)));
}

function arbitraryPath(config: PrecommitConfig = PRECOMMIT_DEFAULTS): fc.Arbitrary<string> {
  return fc.oneof(
    arbitrarySourcePath(config),
    arbitraryTestPath(config),
    arbitraryOtherPath(config),
    arbitraryPathFragment(),
  );
}

function arbitraryFileList(config: PrecommitConfig = PRECOMMIT_DEFAULTS): fc.Arbitrary<string[]> {
  return fc.array(arbitraryPath(config));
}

function arbitraryNonSuccessExitCode(): fc.Arbitrary<number> {
  const minNonSuccessExitCode = 2;
  const maxProcessExitCode = 255;
  return fc.integer({ min: minNonSuccessExitCode, max: maxProcessExitCode });
}
