import { describe, expect, it } from "vitest";

import { defaultGitDependencies, INCOMPLETE_RUN_EXIT_CODE } from "@/lib/git/root";

describe("default git runner — incomplete run", () => {
  it("GIVEN an executable that cannot be spawned WHEN the runner executes it THEN the exit code is non-zero", async () => {
    const unspawnableExecutable = "spx-executable-that-does-not-exist";
    const result = await defaultGitDependencies.execa(unspawnableExecutable, [], { reject: false });

    expect(result.exitCode).toBe(INCOMPLETE_RUN_EXIT_CODE);
    expect(result.exitCode).not.toBe(0);
  });
});
