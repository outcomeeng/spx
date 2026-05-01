import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import type { ConfigDescriptor, Result } from "@/config/types";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/lib/spec-tree/config";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

type SpyDescriptorConfig = { readonly label: string };

function spyDescriptor(label: string): {
  readonly descriptor: ConfigDescriptor<SpyDescriptorConfig>;
  readonly seen: unknown[];
} {
  const seen: unknown[] = [];
  const descriptor: ConfigDescriptor<SpyDescriptorConfig> = {
    section: label,
    defaults: { label },
    validate(value: unknown): Result<SpyDescriptorConfig> {
      seen.push(value);
      if (typeof value !== "object" || value === null) {
        return { ok: false, error: `${label} must be an object` };
      }
      const candidate = value as { label?: unknown };
      if (candidate.label !== undefined && typeof candidate.label !== "string") {
        return { ok: false, error: `${label}.label must be a string` };
      }
      return { ok: true, value: { label: typeof candidate.label === "string" ? candidate.label : label } };
    },
  };
  return { descriptor, seen };
}

describe("resolveConfig — per-descriptor validation isolation (C2)", () => {
  it("each validator receives only its own parsed section — not the raw config, not another descriptor's value", async () => {
    const probeA = spyDescriptor("sectionA");
    const probeB = spyDescriptor("sectionB");

    const projectConfig: Config = {
      sectionA: { label: "from-config-A" },
      sectionB: { label: "from-config-B" },
    };

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      await resolveConfig(projectDir, [probeA.descriptor, probeB.descriptor]);

      expect(probeA.seen).toEqual([{ label: "from-config-A" }]);
      expect(probeB.seen).toEqual([{ label: "from-config-B" }]);
    });
  });

  it("validators do not observe sections belonging to other descriptors", async () => {
    const probe = spyDescriptor("onlyMe");
    const projectConfig: Config = {
      onlyMe: { label: "mine" },
      [specTreeConfigDescriptor.section]: { kinds: { enabler: KIND_REGISTRY.enabler } },
    };

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      await resolveConfig(projectDir, [specTreeConfigDescriptor, probe.descriptor]);

      expect(probe.seen).toEqual([{ label: "mine" }]);
      for (const observation of probe.seen) {
        expect(observation).not.toHaveProperty("kinds");
        expect(observation).not.toHaveProperty(specTreeConfigDescriptor.section);
      }
    });
  });

  it("does not invoke the validator when config content omits the section — defaults are trusted and returned as-is", async () => {
    const probe = spyDescriptor("omitted");

    await withTestEnv({}, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [probe.descriptor]);

      expect(probe.seen).toEqual([]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value["omitted"]).toEqual(probe.descriptor.defaults);
      }
    });
  });
});
