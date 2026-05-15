import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { PATH_FILTER_CONFIG_FIELDS } from "@/config/primitives/path-filter";
import { productionRegistry } from "@/config/registry";
import { RESULT_VALUE_KEY } from "@/config/types";
import { runVerifyCommand } from "@/domains/audit/cli";
import {
  AUDIT_CONFIG_FIELDS,
  AUDIT_SECTION,
  type AuditConfig,
  auditConfigDescriptor,
  DEFAULT_AUDIT_CONFIG,
} from "@/domains/audit/config";
import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE } from "@/domains/audit/reader";
import { VALIDATION_SECTION, validationConfigDescriptor } from "@/validation/config/descriptor";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { renderAuditVerdictXml } from "@testing/harnesses/audit/harness";
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
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.STORAGE);
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.BASE_REF);
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.BRANCH_SLUG);
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.AUDITORS);
  expect(value).toHaveProperty(AUDIT_CONFIG_FIELDS.TARGETS);
  return value as AuditConfig;
}

function auditPath(...segments: readonly string[]): string {
  return [AUDIT_SECTION, ...segments].join(".");
}

describe("audit config descriptor", () => {
  it("registers the audit section in the production config registry", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = await resolveConfig(productDir, productionRegistry);
      const config = expectResolvedConfig(result);

      expect(assertAuditConfig(config[AUDIT_SECTION])).toEqual(DEFAULT_AUDIT_CONFIG);
    });
  });

  it("resolves storage, base ref, branch slug, auditors, and target filters from config", async () => {
    const filter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());
    const storage = {
      [AUDIT_CONFIG_FIELDS.SPX_DIR]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      [AUDIT_CONFIG_FIELDS.NODES_DIR]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      [AUDIT_CONFIG_FIELDS.AUDIT_DIR]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      [AUDIT_CONFIG_FIELDS.RUNS_DIR]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      [AUDIT_CONFIG_FIELDS.VERDICT_FILE]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      [AUDIT_CONFIG_FIELDS.VERDICT_FILE_SUFFIX]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      [AUDIT_CONFIG_FIELDS.STATE_FILE]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    };
    const config: Config = {
      [AUDIT_SECTION]: {
        [AUDIT_CONFIG_FIELDS.STORAGE]: storage,
        [AUDIT_CONFIG_FIELDS.BASE_REF]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
        [AUDIT_CONFIG_FIELDS.BRANCH_SLUG]: {
          [AUDIT_CONFIG_FIELDS.MAX_BYTES]: DEFAULT_AUDIT_CONFIG.branchSlug.maxBytes + 1,
        },
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

      expect(audit.storage).toEqual(storage);
      expect(audit.baseRef).toEqual(config[AUDIT_SECTION][AUDIT_CONFIG_FIELDS.BASE_REF]);
      expect(audit.branchSlug).toEqual(config[AUDIT_SECTION][AUDIT_CONFIG_FIELDS.BRANCH_SLUG]);
      expect(audit.auditors).toEqual(config[AUDIT_SECTION][AUDIT_CONFIG_FIELDS.AUDITORS]);
      expect(audit.targets).toEqual(filter);
    });
  });

  it("rejects invalid storage, branch slug, auditor, and target-filter shapes before audit execution", async () => {
    const invalidPathFilter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidPathFilter());
    const cases: readonly { readonly config: Config; readonly errorPath: string }[] = [
      {
        config: {
          [AUDIT_SECTION]: {
            [AUDIT_CONFIG_FIELDS.STORAGE]: {
              [AUDIT_CONFIG_FIELDS.AUDIT_DIR]: {},
            },
          },
        },
        errorPath: auditPath(AUDIT_CONFIG_FIELDS.STORAGE, AUDIT_CONFIG_FIELDS.AUDIT_DIR),
      },
      {
        config: {
          [AUDIT_SECTION]: {
            [AUDIT_CONFIG_FIELDS.BRANCH_SLUG]: {
              [AUDIT_CONFIG_FIELDS.MAX_BYTES]: DEFAULT_AUDIT_CONFIG.branchSlug.maxBytes * 0,
            },
          },
        },
        errorPath: auditPath(AUDIT_CONFIG_FIELDS.BRANCH_SLUG, AUDIT_CONFIG_FIELDS.MAX_BYTES),
      },
      {
        config: {
          [AUDIT_SECTION]: {
            [AUDIT_CONFIG_FIELDS.AUDITORS]: [DEFAULT_AUDIT_CONFIG.auditors],
          },
        },
        errorPath: auditPath(AUDIT_CONFIG_FIELDS.AUDITORS),
      },
      {
        config: {
          [AUDIT_SECTION]: {
            [AUDIT_CONFIG_FIELDS.TARGETS]: invalidPathFilter.value,
          },
        },
        errorPath: invalidPathFilter.error.replace(
          invalidPathFilter.path,
          auditPath(AUDIT_CONFIG_FIELDS.TARGETS),
        ),
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
          [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: [DEFAULT_AUDIT_CONFIG.storage.spxDir],
        },
      },
    };

    await withTestEnv(config, async ({ productDir }) => {
      const resolved = expectResolvedConfig(
        await resolveConfig(productDir, [auditConfigDescriptor, validationConfigDescriptor]),
      );

      expect(assertAuditConfig(resolved[AUDIT_SECTION]).targets).toEqual(
        config[AUDIT_SECTION][AUDIT_CONFIG_FIELDS.TARGETS],
      );
      expect(resolved[VALIDATION_SECTION]).toEqual(validationConfigDescriptor.defaults);
    });
  });

  it("leaves explicit audit verdict verification independent from audit target filters", async () => {
    const excludedTarget = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const config: Config = {
      [AUDIT_SECTION]: {
        [AUDIT_CONFIG_FIELDS.TARGETS]: {
          [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: [excludedTarget],
        },
      },
    };
    const verdictXml = renderAuditVerdictXml({
      specNode: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      verdict: AUDIT_VERDICT_VALUE.APPROVED,
      timestamp: sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()),
      gates: [
        {
          name: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
          status: AUDIT_GATE_STATUS.PASS,
          findings: [],
        },
      ],
    });

    await withTestEnv(config, async ({ productDir, writeRaw }) => {
      const configResult = await resolveConfig(productDir, [auditConfigDescriptor]);
      expectResolvedConfig(configResult);
      await writeRaw(DEFAULT_AUDIT_CONFIG.storage.verdictFile, verdictXml);
      const output: string[] = [];

      const exitCode = await runVerifyCommand(
        join(productDir, DEFAULT_AUDIT_CONFIG.storage.verdictFile),
        productDir,
        (line) => output.push(line),
      );

      expect(exitCode).toBe(0);
      expect(output).toEqual([AUDIT_VERDICT_VALUE.APPROVED]);
    });
  });
});
