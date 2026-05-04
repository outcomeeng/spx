import * as fc from "fast-check";

import { PRECOMMIT_DEFAULTS, type PrecommitConfig } from "@/lib/precommit/config";

export const PRECOMMIT_TEST_GENERATOR = {
  config: arbitraryPrecommitConfig,
  sourcePath: arbitrarySourcePath,
  testPath: arbitraryTestPath,
  otherPath: arbitraryOtherPath,
} as const;

export function samplePrecommitTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) throw new Error("Precommit test generator returned no sample");
  return value;
}

function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9-]{2,12}$/);
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
