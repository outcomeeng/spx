import { describe, expect, it } from "vitest";

import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { KIND_REGISTRY } from "@/lib/spec-tree";
import { specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  methodologyPackageConfig,
  parseContextManifest,
  runSpecCliWithIsolation,
  writeMethodologyPackage,
} from "@testing/harnesses/spec/context";

describe("spec context understand payload network abstinence", () => {
  it("sources the foundation from the installed package through the packaged executable with zero outbound network attempts", async () => {
    await withSpecTreeEnv(methodologyPackageConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyPackage(env);
      const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);

      const execution = await runSpecCliWithIsolation(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        target,
        SPEC_DOMAIN_CLI.JSON_OPTION,
        SPEC_DOMAIN_CLI.UNDERSTAND_OPTION,
      );

      expect(execution.result.exitCode, execution.result.stderr).toBe(0);
      expect(execution.networkAttempts).toEqual([]);
      const manifest = parseContextManifest(execution.result.stdout);
      expect(
        manifest.read.find((document) => document.path === fixture.corePath)?.content,
      ).toBe(fixture.coreText);
    });
  });
});
