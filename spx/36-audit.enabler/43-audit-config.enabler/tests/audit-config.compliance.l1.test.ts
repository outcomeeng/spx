import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { PATH_FILTER_CONFIG_FIELDS } from "@/config/primitives/path-filter";
import { productionRegistry } from "@/config/registry";
import { RESULT_VALUE_KEY } from "@/config/types";
import {
  AUDIT_CONFIG_FIELDS,
  AUDIT_SECTION,
  type AuditConfig,
  auditConfigDescriptor,
  DEFAULT_AUDIT_CONFIG,
} from "@/domains/audit/config";
import { VALIDATION_SECTION, validationConfigDescriptor } from "@/validation/config/descriptor";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function expectResolvedConfig(result: Awaited<ReturnType<typeof resolveConfig>>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function expectRejectedConfig(result: Awaited<ReturnType<typeof resolveConfig>>, expectedErrorPath: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(expectedErrorPath);
    expect(RESULT_VALUE_KEY in result).toBe(false);
  }
}

function assertAuditConfig(value: unknown): AuditConfig {
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.BASE_REF);
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.AUDITORS);
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.TARGETS);
  return value as AuditConfig;
}

type AuditTargetsOnly = Pick<AuditConfig, typeof AUDIT_CONFIG_FIELDS.TARGETS>;

function auditPath(...segments: readonly string[]): string {
  return [AUDIT_SECTION, ...segments].join(".");
}

function sampleUnknownField(disallowed: readonly string[]): string {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.key().filter((key) => !disallowed.includes(key)));
}

describe("audit config descriptor", () => {
  it("registers the audit section in the production config registry", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = await resolveConfig(productDir, productionRegistry);
      const config = expectResolvedConfig(result);

      expect(assertAuditConfig(config[AUDIT_SECTION])).toEqual(DEFAULT_AUDIT_CONFIG);
    });
  });

  it("resolves base ref, auditors, and target filters from config", async () => {
    const filter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());
    const config: Config = {
      [AUDIT_SECTION]: {
        [AUDIT_CONFIG_FIELDS.BASE_REF]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
        [AUDIT_CONFIG_FIELDS.AUDITORS]: [
          sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
          sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
        ],
        [AUDIT_CONFIG_FIELDS.TARGETS]: filter,
      },
    };

    await withTestEnv(config, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [auditConfigDescriptor]);
      const resolved = expectResolvedConfig(result);
      const audit = assertAuditConfig(resolved[AUDIT_SECTION]);
      const expectedAudit = assertAuditConfig(config[AUDIT_SECTION]);

      expect(audit.baseRef).toEqual(expectedAudit.baseRef);
      expect(audit.auditors).toEqual(expectedAudit.auditors);
      expect(audit.targets).toEqual(filter);
    });
  });

  it("rejects unknown audit fields, invalid auditors, and invalid target-filter shapes before audit execution", async () => {
    const invalidPathFilter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidPathFilter());
    const unknownValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const unknownAuditField = sampleUnknownField([
      AUDIT_CONFIG_FIELDS.BASE_REF,
      AUDIT_CONFIG_FIELDS.AUDITORS,
      AUDIT_CONFIG_FIELDS.TARGETS,
    ]);
    const cases: readonly { readonly config: Config; readonly errorPath: string }[] = [
      {
        config: {
          [AUDIT_SECTION]: {
            [unknownAuditField]: unknownValue,
          },
        },
        errorPath: auditPath(unknownAuditField),
      },
      {
        config: {
          [AUDIT_SECTION]: {
            [AUDIT_CONFIG_FIELDS.AUDITORS]: [DEFAULT_AUDIT_CONFIG.auditors],
          },
        },
        errorPath: auditPath(AUDIT_CONFIG_FIELDS.AUDITORS, "0"),
      },
      {
        config: {
          [AUDIT_SECTION]: {
            [AUDIT_CONFIG_FIELDS.TARGETS]: invalidPathFilter.value,
          },
        },
        errorPath: auditPath(AUDIT_CONFIG_FIELDS.TARGETS),
      },
    ];

    for (const entry of cases) {
      await withTestEnv(entry.config, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [auditConfigDescriptor]);

        expectRejectedConfig(result, entry.errorPath);
      });
    }
  });

  it("keeps audit descriptor failures isolated from sibling descriptor defaults", async () => {
    const config: Config = {
      [AUDIT_SECTION]: {
        [AUDIT_CONFIG_FIELDS.TARGETS]: {
          [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: [sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())],
        },
      },
    };

    await withTestEnv(config, async ({ productDir }) => {
      const resolved = expectResolvedConfig(
        await resolveConfig(productDir, [auditConfigDescriptor, validationConfigDescriptor]),
      );

      expect(assertAuditConfig(resolved[AUDIT_SECTION]).targets).toEqual(
        (config[AUDIT_SECTION] as AuditTargetsOnly).targets,
      );
      expect(resolved[VALIDATION_SECTION]).toEqual(validationConfigDescriptor.defaults);
    });
  });
});
