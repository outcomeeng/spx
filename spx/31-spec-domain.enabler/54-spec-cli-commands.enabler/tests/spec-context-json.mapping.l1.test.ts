import { describe, expect, it } from "vitest";

import { renderSpecContextText } from "@/commands/spec/context";
import { SPEC_CONTEXT_COMMAND_PATH, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { renderSpecContextEntries } from "@/lib/spec-tree";
import {
  contextListManifest,
  contextShowEntries,
  parseContextEntries,
  parseContextManifest,
  runSpecDescriptor,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context json option", () => {
  it("changes only the representation between the text and JSON forms of list and show", async () => {
    await withRichContextEnv(async (env, paths) => {
      const context = { productDir: env.productDir };
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const showJson = await runSpecDescriptor(
        context,
        ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
        paths.targetId,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      const showText = await runSpecDescriptor(context, ...SPEC_CONTEXT_COMMAND_PATH.SHOW, paths.targetId);
      expect(parseContextEntries(showJson.stdout)).toEqual(entries);
      expect(showText.stdout).toBe(renderSpecContextEntries(entries));

      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      const listJson = await runSpecDescriptor(
        context,
        ...SPEC_CONTEXT_COMMAND_PATH.LIST,
        paths.targetId,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      const listText = await runSpecDescriptor(context, ...SPEC_CONTEXT_COMMAND_PATH.LIST, paths.targetId);
      expect(parseContextManifest(listJson.stdout)).toEqual(manifest);
      expect(listText.stdout).toBe(`${String(renderSpecContextText(manifest))}\n`);
    });
  });
});
