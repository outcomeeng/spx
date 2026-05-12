import { describe, expect, it } from "vitest";

import { getTypeScriptScope } from "@/validation/config/scope";
import { VALIDATION_SCOPES } from "@/validation/types";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("ALWAYS: TypeScript scope resolution uses the requested project root", () => {
  it("discovers TypeScript directories under the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile, String());

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.projectDir);

      expect(scope.directories).toContain(VALIDATION_PIPELINE_DATA.scopeResolutionDirectoryName);
    });
  });
});
