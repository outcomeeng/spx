import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index.js";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

const PARENT_YAML_SENTINEL = "parent-sentinel";

describe("resolveConfig — resolution scope (C1)", () => {
  it("reads spx.config.yaml only at projectRoot — no walking up to parent directories", async () => {
    const parentYamlConfig: Config = {
      specTree: {
        kinds: {
          fabricated: { category: "node", suffix: ".fabricated" },
        },
      },
    };
    const nestedYamlConfig: Config = {};

    await withTestEnv(nestedYamlConfig, async ({ projectDir }) => {
      const fakeParentYaml = join(dirname(projectDir), `spx.config.${PARENT_YAML_SENTINEL}.yaml`);
      await writeFile(fakeParentYaml, "specTree:\n  kinds:\n    fabricated: {category: node, suffix: .fabricated}\n");

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value["specTree"] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds)).not.toContain("fabricated");
      }

      void parentYamlConfig;
    });
  });

  it("ignores yaml files under subdirectories of projectRoot — only the file at the root is consulted", async () => {
    const rootYamlConfig: Config = {
      specTree: { kinds: { enabler: KIND_REGISTRY.enabler } },
    };

    await withTestEnv(rootYamlConfig, async ({ projectDir, writeRaw }) => {
      const nestedDir = join(projectDir, "nested");
      await mkdir(nestedDir, { recursive: true });
      await writeRaw(
        "nested/spx.config.yaml",
        "specTree:\n  kinds:\n    bogus: {category: node, suffix: .bogus}\n",
      );

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value["specTree"] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds)).toEqual(["enabler"]);
      }
    });
  });

  it("takes only projectRoot as input — no flag, no overlay, no layered source composition", async () => {
    const yamlConfig: Config = {
      specTree: { kinds: { pdr: KIND_REGISTRY.pdr } },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value["specTree"] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds)).toEqual(["pdr"]);
      }
    });
  });
});
