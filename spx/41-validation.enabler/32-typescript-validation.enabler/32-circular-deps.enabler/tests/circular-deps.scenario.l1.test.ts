import { describe, it } from "vitest";

import {
  runCircularDepsScenarioL1Case001,
  runCircularDepsScenarioL1Case002,
  runCircularDepsScenarioL1Case003,
  runCircularDepsScenarioL1Case004,
  runCircularDepsScenarioL1Case005,
  runCircularDepsScenarioL1Case006,
  runCircularDepsScenarioL1Case007,
  runCircularDepsScenarioL1Case008,
  runCircularDepsScenarioL1Case009,
  runCircularDepsScenarioL1Case010,
  runCircularDepsScenarioL1Case011,
  runCircularDepsScenarioL1Case012,
  runCircularDepsScenarioL1Case013,
  runCircularDepsScenarioL1Case014,
  runCircularDepsScenarioL1Case015,
  runCircularDepsScenarioL1Case016,
  runCircularDepsScenarioL1Case017,
  runCircularDepsScenarioL1Case018,
  runCircularDepsScenarioL1Case019,
  runCircularDepsScenarioL1Case020,
  runCircularDepsScenarioL1Case021,
  runCircularDepsScenarioL1Case022,
  runCircularDepsScenarioL1Case023,
  runCircularDepsScenarioL1Case024,
  runCircularDepsScenarioL1Case025,
  runCircularDepsScenarioL1Case026,
  runCircularDepsScenarioL1Case027,
  runCircularDepsScenarioL1Case028,
  runCircularDepsScenarioL1Case029,
  runCircularDepsScenarioL1Case030,
  runCircularDepsScenarioL1Case031,
  runCircularDepsScenarioL1Case032,
  runCircularDepsScenarioL1Case033,
  runCircularDepsScenarioL1Case034,
  runCircularDepsScenarioL1Case035,
  runCircularDepsScenarioL1Case036,
  runCircularDepsScenarioL1Case037,
  runCircularDepsScenarioL1Case038,
  runCircularDepsScenarioL1Case039,
  runCircularDepsScenarioL1Case040,
  runCircularDepsScenarioL1Case041,
  runCircularDepsScenarioL1Case042,
  runCircularDepsScenarioL1Case043,
  runCircularDepsScenarioL1Case044,
  runCircularDepsScenarioL1Case045,
  runCircularDepsScenarioL1Case046,
  runCircularDepsScenarioL1Case047,
  runCircularDepsScenarioL1Case048,
  runCircularDepsScenarioL1Case049,
  runCircularDepsScenarioL1Case050,
  runCircularDepsScenarioL1Case051,
  runCircularDepsScenarioL1Case052,
  runCircularDepsScenarioL1Case053,
  runCircularDepsScenarioL1Case054,
  runCircularDepsScenarioL1Case055,
  runCircularDepsScenarioL1Case056,
  runCircularDepsScenarioL1Case057,
  runCircularDepsScenarioL1Case058,
  runCircularDepsScenarioL1Case059,
  runCircularDepsScenarioL1Case060,
  runCircularDepsScenarioL1Case061,
  runCircularDepsScenarioL1Case062,
  runCircularDepsScenarioL1Case063,
  runCircularDepsScenarioL1Case064,
  runCircularDepsScenarioL1Case065,
  runCircularDepsScenarioL1Case066,
} from "@testing/harnesses/validation/circular-deps";

describe("circular dependency filtering", () => {
  it("limits dependency-cruiser cruise inputs and resolution to TypeScript sources", runCircularDepsScenarioL1Case001);
  it(
    "uses file patterns as dependency-cruiser inputs when the validation scope is explicit files",
    runCircularDepsScenarioL1Case002,
  );
  it(
    "skips non-TypeScript fallback file patterns before invoking dependency-cruiser",
    runCircularDepsScenarioL1Case003,
  );
  it("keeps directory inputs when narrower file patterns do not fully cover them", runCircularDepsScenarioL1Case004);
  it(
    "keeps root-level TypeScript globs when dependency-cruiser inputs also include directories",
    runCircularDepsScenarioL1Case005,
  );
  it("keeps directory inputs when non-TypeScript globs are present", runCircularDepsScenarioL1Case006);
  it(
    "keeps TypeScript-only include globs from widening to every TypeScript extension",
    runCircularDepsScenarioL1Case007,
  );
  it(
    "keeps broad TypeScript include globs from expanding to every TypeScript extension",
    runCircularDepsScenarioL1Case008,
  );
  it(
    "keeps nested TypeScript include globs instead of widening them to their top-level directory",
    runCircularDepsScenarioL1Case009,
  );
  it(
    "keeps literal TypeScript file includes from widening to their top-level directory",
    runCircularDepsScenarioL1Case010,
  );
  it("keeps retained directory targets when literal TypeScript files also match", runCircularDepsScenarioL1Case011);
  it(
    "keeps wildcard-narrowed TypeScript include globs instead of widening them to their top-level directory",
    runCircularDepsScenarioL1Case012,
  );
  it("converts glob exclude patterns before passing them to dependency-cruiser", runCircularDepsScenarioL1Case013);
  it("allows dependency-cruiser glob excludes to match prefixed module paths", runCircularDepsScenarioL1Case014);
  it("converts directory-subtree excludes to anchored dependency-cruiser patterns", runCircularDepsScenarioL1Case015);
  it(
    "converts recursive dependency-cruiser glob excludes without unsafe regex shapes",
    runCircularDepsScenarioL1Case016,
  );
  it("fails clearly when dependency-cruiser returns non-structured reporter output", runCircularDepsScenarioL1Case017);
  it("fails clearly when dependency-cruiser returns null reporter output", runCircularDepsScenarioL1Case018);
  it(
    "ignores a cycle when the initial dependency survives runtime but a cycle vertex is type-erased",
    runCircularDepsScenarioL1Case019,
  );
  it(
    "reports a cycle when mixed value and type-only labels still include a runtime dependency",
    runCircularDepsScenarioL1Case020,
  );
  it(
    "reports a cycle when mixed value and type-import labels still include a runtime dependency",
    runCircularDepsScenarioL1Case021,
  );
  it(
    "reports a dependency-cruiser circular dependency without a cycle payload when the dependency survives runtime",
    runCircularDepsScenarioL1Case022,
  );
  it(
    "ignores a dependency-cruiser circular dependency without a cycle payload when the initial dependency is type-erased",
    runCircularDepsScenarioL1Case023,
  );
  it(
    "ignores a pre-compilation-only cycle vertex even when it carries an import label",
    runCircularDepsScenarioL1Case024,
  );
  it("ignores a pure pre-compilation-only circular dependency", runCircularDepsScenarioL1Case025);
});

describe("circular command scope routing", () => {
  it("reports a real circular dependency from a TypeScript project", runCircularDepsScenarioL1Case026);
  it("reports no cycles for a project whose circular imports are type-only", runCircularDepsScenarioL1Case027);
  it("honors recursive generated-file excludes accepted by dependency-cruiser", runCircularDepsScenarioL1Case028);
  it(
    "skips circular validation without invoking dependency-cruiser when TypeScript is absent",
    runCircularDepsScenarioL1Case029,
  );
  it(
    "skips circular validation without invoking dependency-cruiser when tsconfig is absent",
    runCircularDepsScenarioL1Case030,
  );
  it("forwards explicit path operands as project-relative dependency-cruiser inputs", runCircularDepsScenarioL1Case031);
  it("rejects out-of-project path operands before circular validation runs", runCircularDepsScenarioL1Case032);
  it("forwards path operand directories as constrained TypeScript scope", runCircularDepsScenarioL1Case033);
  it(
    "forwards path operand directories covered by config include when tsconfig uses default includes",
    runCircularDepsScenarioL1Case034,
  );
  it("drops explicit file operands already covered by explicit directory operands", runCircularDepsScenarioL1Case035);
  it(
    "forwards path operand directories that intersect wildcard-backed TypeScript includes",
    runCircularDepsScenarioL1Case036,
  );
  it(
    "forwards path operand directories that intersect single-character TypeScript includes",
    runCircularDepsScenarioL1Case037,
  );
  it(
    "constrains explicit directories when TypeScript includes also name narrower files",
    runCircularDepsScenarioL1Case038,
  );
  it(
    "constrains explicit subdirectories under literal TypeScript directory includes",
    runCircularDepsScenarioL1Case039,
  );
  it("constrains TypeScript include globs to explicit directories", runCircularDepsScenarioL1Case040);
  it("drops explicit files covered by constrained directory globs", runCircularDepsScenarioL1Case041);
  it(
    "preserves nested TypeScript include suffixes when constraining explicit directories",
    runCircularDepsScenarioL1Case042,
  );
  it("skips explicit directories that intersect only non-TypeScript include globs", runCircularDepsScenarioL1Case043);
  it(
    "skips the project root when TypeScript config includes only non-TypeScript globs",
    runCircularDepsScenarioL1Case044,
  );
  it(
    "skips path operand directories below single-character wildcard TypeScript includes",
    runCircularDepsScenarioL1Case045,
  );
  it("forwards root path operand directories as the existing TypeScript scope", runCircularDepsScenarioL1Case046);
  it(
    "forwards existing dotted path operand directories as constrained TypeScript scope",
    runCircularDepsScenarioL1Case047,
  );
  it(
    "forwards explicit directories with TypeScript-like suffixes as constrained TypeScript scope",
    runCircularDepsScenarioL1Case048,
  );
  it("keeps explicit TypeScript files when glob-only excludes do not match them", runCircularDepsScenarioL1Case049);
  it("skips explicit directories covered by TypeScript exclude patterns", runCircularDepsScenarioL1Case050);
  it(
    "converts single-character wildcard exclude patterns before passing them to dependency-cruiser",
    runCircularDepsScenarioL1Case051,
  );
  it("resolves repeated recursive glob directory matching with bounded work", runCircularDepsScenarioL1Case052);
  it(
    "forwards explicit modern TypeScript module files as dependency-cruiser file scope",
    runCircularDepsScenarioL1Case053,
  );
  it("skips explicit TypeScript files outside resolved TypeScript config scope", runCircularDepsScenarioL1Case054);
  it("passes production TypeScript scope to dependency-cruiser", runCircularDepsScenarioL1Case055);
  it("ignores real circular dependencies outside production TypeScript scope", runCircularDepsScenarioL1Case056);
  it("skips explicit files outside the requested TypeScript scope", runCircularDepsScenarioL1Case057);
  it(
    "skips missing explicit TypeScript files instead of invoking dependency-cruiser",
    runCircularDepsScenarioL1Case058,
  );
  it("canonicalizes dot-segment explicit files before TypeScript scope checks", runCircularDepsScenarioL1Case059);
  it("skips explicit non-TypeScript files inside the TypeScript scope", runCircularDepsScenarioL1Case060);
  it("skips existing extensionless files inside the TypeScript scope", runCircularDepsScenarioL1Case061);
  it("skips declaration files inside the TypeScript scope", runCircularDepsScenarioL1Case062);
  it("skips explicit relative paths that escape the project root", runCircularDepsScenarioL1Case063);
  it("keeps explicit root files whose names start with dot segments", runCircularDepsScenarioL1Case064);
  it("skips missing explicit directories instead of trusting trailing slashes", runCircularDepsScenarioL1Case065);
  it("maps circular dependencies reported by the validation step to CLI output", runCircularDepsScenarioL1Case066);
});
