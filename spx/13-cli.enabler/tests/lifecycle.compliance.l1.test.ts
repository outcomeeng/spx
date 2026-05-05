import { describe, expect, it } from "vitest";

import { lifecycleProcessRunner } from "@/lib/process-lifecycle";
import { defaultEslintProcessRunner } from "@/validation/steps/eslint";
import { defaultKnipProcessRunner } from "@/validation/steps/knip";
import { defaultTypeScriptProcessRunner } from "@/validation/steps/typescript";

describe("Compliance: validation step ProcessRunner defaults reference lifecycleProcessRunner", () => {
  it("defaultEslintProcessRunner is the shared lifecycleProcessRunner", () => {
    expect(defaultEslintProcessRunner).toBe(lifecycleProcessRunner);
  });

  it("defaultTypeScriptProcessRunner is the shared lifecycleProcessRunner", () => {
    expect(defaultTypeScriptProcessRunner).toBe(lifecycleProcessRunner);
  });

  it("defaultKnipProcessRunner is the shared lifecycleProcessRunner", () => {
    expect(defaultKnipProcessRunner).toBe(lifecycleProcessRunner);
  });
});
