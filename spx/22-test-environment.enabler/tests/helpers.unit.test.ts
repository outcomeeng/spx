import { readFile as nativeReadFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

const MINIMAL_CONFIG: Config = {
  specTree: {
    kinds: {
      enabler: { category: "node", suffix: ".enabler" },
      outcome: { category: "node", suffix: ".outcome" },
      adr: { category: "decision", suffix: ".adr.md" },
      pdr: { category: "decision", suffix: ".pdr.md" },
    },
  },
};

const NODE_BODY = "# Some Enabler\n\nPROVIDES X SO THAT Y CAN Z\n";
const DECISION_BODY = "# Decision\n\n## Purpose\n\nGoverns X.\n";
const RAW_BODY = "arbitrary text";

describe("withTestEnv — writeNode", () => {
  it("writes a node spec file under the temp project directory and a subsequent read observes the change", async () => {
    await withTestEnv(MINIMAL_CONFIG, async ({ projectDir, writeNode, readFile }) => {
      await writeNode("21-sample.enabler/sample.md", NODE_BODY);

      const viaEnv = await readFile("21-sample.enabler/sample.md");
      const viaDisk = await nativeReadFile(join(projectDir, "21-sample.enabler/sample.md"), "utf8");

      expect(viaEnv).toBe(NODE_BODY);
      expect(viaDisk).toBe(NODE_BODY);
    });
  });
});

describe("withTestEnv — writeDecision", () => {
  it("writes a decision record file under the temp project directory and readFile sees it", async () => {
    await withTestEnv(MINIMAL_CONFIG, async ({ writeDecision, readFile }) => {
      await writeDecision("21-choice.adr.md", DECISION_BODY);

      const viaEnv = await readFile("21-choice.adr.md");

      expect(viaEnv).toBe(DECISION_BODY);
    });
  });
});

describe("withTestEnv — writeRaw", () => {
  it("writes arbitrary bytes at the given relative path under the temp project directory", async () => {
    await withTestEnv(MINIMAL_CONFIG, async ({ projectDir, writeRaw, readFile }) => {
      await writeRaw("notes/misc.txt", RAW_BODY);

      const viaEnv = await readFile("notes/misc.txt");
      const viaDisk = await nativeReadFile(join(projectDir, "notes/misc.txt"), "utf8");

      expect(viaEnv).toBe(RAW_BODY);
      expect(viaDisk).toBe(RAW_BODY);
    });
  });
});

describe("withTestEnv — readFile", () => {
  it("reads the materialized project config file at the root", async () => {
    await withTestEnv(MINIMAL_CONFIG, async ({ readFile }) => {
      const raw = await readFile(DEFAULT_CONFIG_FILENAME);
      expect(raw.length).toBeGreaterThan(0);
    });
  });
});
