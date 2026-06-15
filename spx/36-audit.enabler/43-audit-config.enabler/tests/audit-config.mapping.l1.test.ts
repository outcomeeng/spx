import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_FORMAT_ORDER,
  CONFIG_FILENAMES,
  type ConfigFileFormat,
  DEFAULT_CONFIG_FILENAME,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import {
  AUDIT_CONFIG_FIELDS,
  AUDIT_SECTION,
  type AuditConfig,
  auditConfigDescriptor,
  DEFAULT_AUDIT_CONFIG,
} from "@/domains/audit/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function serializeConfig(format: ConfigFileFormat, config: Config): string {
  const serialized = serializeConfigFileSections(format, config as Record<string, unknown>);
  if (!serialized.ok) throw new Error(serialized.error);
  return serialized.value;
}

function expectResolvedConfig(result: Awaited<ReturnType<typeof resolveConfig>>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function assertAuditConfig(value: unknown): AuditConfig {
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.BASE_REF);
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.AUDITORS);
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.TARGETS);
  return value as AuditConfig;
}

describe("audit config descriptor format mapping", () => {
  it("resolves equivalent audit sections from JSON, YAML, and TOML config files", async () => {
    const config: Config = {
      [AUDIT_SECTION]: {
        [AUDIT_CONFIG_FIELDS.BASE_REF]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
        [AUDIT_CONFIG_FIELDS.AUDITORS]: [sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())],
        [AUDIT_CONFIG_FIELDS.TARGETS]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter()),
      },
    };
    const results: Partial<Record<ConfigFileFormat, AuditConfig>> = {};

    for (const format of CONFIG_FILE_FORMAT_ORDER) {
      await withTestEnv({}, async ({ productDir, writeRaw }) => {
        await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
        await writeRaw(CONFIG_FILENAMES[format], serializeConfig(format, config));
        const result = await resolveConfig(productDir, [auditConfigDescriptor]);
        const resolved = expectResolvedConfig(result);
        results[format] = assertAuditConfig(resolved[AUDIT_SECTION]);
      });
    }

    expect(Object.keys(results).sort()).toEqual([...CONFIG_FILE_FORMAT_ORDER].sort());
    expect(results[CONFIG_FILE_FORMAT.JSON]).toEqual(results[CONFIG_FILE_FORMAT.YAML]);
    expect(results[CONFIG_FILE_FORMAT.TOML]).toEqual(results[CONFIG_FILE_FORMAT.YAML]);
  });
});
