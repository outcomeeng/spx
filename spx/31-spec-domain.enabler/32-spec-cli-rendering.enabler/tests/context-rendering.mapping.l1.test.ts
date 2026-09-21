import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION } from "@/lib/spec-tree";
import {
  allManifestPaths,
  contextListJson,
  contextListManifest,
  contextListText,
  parseContextManifest,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context list rendering", () => {
  it("maps one manifest to its JSON and human representations without changing the selected information", async () => {
    await withRichContextEnv(async (env, paths) => {
      const options = { targets: [paths.rootDirectory, paths.targetId], cwd: env.productDir };
      const manifest = await contextListManifest(options);
      expect(parseContextManifest(await contextListJson(options))).toEqual(manifest);
      const text = await contextListText(options);
      for (const path of allManifestPaths(manifest)) {
        expect(text).toContain(path);
      }
      for (const target of manifest.targets) {
        expect(text).toContain(target);
      }
      expect(text).toContain(`${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION}`);
      expect(text).toContain(`${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${manifest.productDir}`);
      expect(text).toContain(`${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: ${String(manifest.bootstrap)}`);
      expect(text).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${manifest.methodology.source}@${
          String(manifest.methodology.version)
        }`,
      );
      for (const document of manifest.read) {
        for (const binding of document.roles) {
          expect(text).toContain(`${binding.role}@${binding.target}`);
        }
        for (const citer of document.citedBy ?? []) {
          expect(text).toContain(citer);
        }
      }
    });
  });
});
