import { readFile as nativeReadFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withTestEnv — writeNode", () => {
  it("writes a node spec file under the temp product directory and a subsequent read observes the change", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeNode, readFile }) => {
      const nodeBody = "# Some Enabler\n\nPROVIDES X SO THAT Y CAN Z\n";

      await writeNode("21-sample.enabler/sample.md", nodeBody);

      const viaEnv = await readFile("21-sample.enabler/sample.md");
      const viaDisk = (await nativeReadFile(join(productDir, "21-sample.enabler/sample.md"))).toString();

      expect(viaEnv).toBe(nodeBody);
      expect(viaDisk).toBe(nodeBody);
    });
  });
});

describe("withTestEnv — writeDecision", () => {
  it("writes a decision record file under the temp product directory and readFile sees it", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ writeDecision, readFile }) => {
      const decisionBody = "# Decision\n\n## Purpose\n\nGoverns X.\n";

      await writeDecision("21-choice.adr.md", decisionBody);

      const viaEnv = await readFile("21-choice.adr.md");

      expect(viaEnv).toBe(decisionBody);
    });
  });
});

describe("withTestEnv — writeRaw", () => {
  it("writes arbitrary bytes at the given relative path under the temp product directory", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeRaw, readFile }) => {
      const rawBody = "arbitrary text";

      await writeRaw("notes/misc.txt", rawBody);

      const viaEnv = await readFile("notes/misc.txt");
      const viaDisk = (await nativeReadFile(join(productDir, "notes/misc.txt"))).toString();

      expect(viaEnv).toBe(rawBody);
      expect(viaDisk).toBe(rawBody);
    });
  });
});

describe("withTestEnv — readFile", () => {
  it("reads the materialized product config file at the root", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ readFile }) => {
      const raw = await readFile(DEFAULT_CONFIG_FILENAME);
      expect(raw.length).toBeGreaterThan(0);
    });
  });
});
