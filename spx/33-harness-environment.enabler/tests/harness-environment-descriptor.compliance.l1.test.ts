import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { productionRegistry } from "@/config/registry";
import { RESULT_VALUE_KEY } from "@/config/types";
import {
  AGENT,
  DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS,
  HARNESS_ENVIRONMENT_SECTION,
  type HarnessEnvironmentConfig,
  harnessEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  harnessEnvironmentPath,
  sampleHarnessEnvironmentKey,
  sampleUnknownAgent,
  sampleUnknownHarnessEnvironmentField,
  sampleUnknownHarnessEnvironmentValue,
} from "@testing/harnesses/agent-environment/config";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function runHarnessEnvironmentDescriptorComplianceTests(): void {
  describe("harness environment config descriptor", () => {
    it("registers the harness environment section in the default production config registry", async () => {
      const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.harnessEnvironmentConfig());

      await withTestEnv(generated.config, async ({ productDir }) => {
        const result = await resolveConfig(productDir);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const harnessEnvironment = result.value[HARNESS_ENVIRONMENT_SECTION] as HarnessEnvironmentConfig;

        expect(harnessEnvironment).toEqual(generated.expected);
      });
    });

    it("resolves descriptor defaults for omitted harness environment config", async () => {
      await withTestEnv({}, async ({ productDir }) => {
        const result = await resolveConfig(productDir, productionRegistry);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value[HARNESS_ENVIRONMENT_SECTION]).toEqual(
          harnessEnvironmentConfigDescriptor.defaults,
        );
      });
    });

    it("resolves default agents for an explicit empty agents section", async () => {
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {},
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const harnessEnvironment = result.value[HARNESS_ENVIRONMENT_SECTION] as HarnessEnvironmentConfig;

        expect(harnessEnvironment.agents).toEqual(harnessEnvironmentConfigDescriptor.defaults.agents);
      });
    });

    it("resolves per-agent hook policy defaults", async () => {
      await withTestEnv({}, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const harnessEnvironment = result.value[HARNESS_ENVIRONMENT_SECTION] as HarnessEnvironmentConfig;

        expect(harnessEnvironment.agents[AGENT.CODEX].hooks.sessionStart.compactStdout).toBe(false);
        expect(harnessEnvironment.agents[AGENT.CLAUDE_CODE].hooks.sessionStart.compactStdout).toBe(true);
      });
    });

    it("resolves explicit agent hook policy overrides", async () => {
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {
            [AGENT.CODEX]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.HOOKS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SESSION_START]: {
                  [HARNESS_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT]: true,
                },
              },
            },
            [AGENT.CLAUDE_CODE]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.HOOKS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SESSION_START]: {
                  [HARNESS_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT]: false,
                },
              },
            },
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const harnessEnvironment = result.value[HARNESS_ENVIRONMENT_SECTION] as HarnessEnvironmentConfig;

        expect(harnessEnvironment.agents[AGENT.CODEX].hooks.sessionStart.compactStdout).toBe(true);
        expect(harnessEnvironment.agents[AGENT.CLAUDE_CODE].hooks.sessionStart.compactStdout).toBe(false);
      });
    });

    it("resolves default instruction files for an explicit empty instructions section", async () => {
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {},
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const harnessEnvironment = result.value[HARNESS_ENVIRONMENT_SECTION] as HarnessEnvironmentConfig;

        expect(harnessEnvironment.instructions).toEqual(harnessEnvironmentConfigDescriptor.defaults.instructions);
      });
    });

    it("allows an empty instruction file list to disable instruction file management", async () => {
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [],
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const harnessEnvironment = result.value[HARNESS_ENVIRONMENT_SECTION] as HarnessEnvironmentConfig;

        expect(harnessEnvironment.instructions.files).toEqual([]);
      });
    });

    it("rejects unregistered agent ids before child reconcilers run", async () => {
      const unknownAgent = sampleUnknownAgent();
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {
            [unknownAgent]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: true,
            },
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(
            harnessEnvironmentPath(HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS, unknownAgent),
          );
          expect(RESULT_VALUE_KEY in result).toBe(false);
        }
      });
    });

    it("rejects non-object descriptor subsections", async () => {
      const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: sampleUnknownHarnessEnvironmentValue(),
            },
          },
          expectedErrorPath: harnessEnvironmentPath(HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: [AGENT.CODEX],
            },
          },
          expectedErrorPath: harnessEnvironmentPath(HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: true,
            },
          },
          expectedErrorPath: harnessEnvironmentPath(HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP),
        },
      ];

      for (const { productConfig, expectedErrorPath } of malformedSections) {
        await withTestEnv(productConfig, async ({ productDir }) => {
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain(expectedErrorPath);
            expect(RESULT_VALUE_KEY in result).toBe(false);
          }
        });
      }
    });

    it("rejects malformed subsection field values", async () => {
      const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: sampleHarnessEnvironmentKey(),
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: "",
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CODEX],
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {
                [AGENT.CODEX]: {
                  [HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: sampleHarnessEnvironmentKey(),
                },
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS,
            AGENT.CODEX,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {
                [AGENT.CODEX]: {
                  [HARNESS_ENVIRONMENT_CONFIG_FIELDS.HOOKS]: {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SESSION_START]: {
                      [HARNESS_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT]: sampleHarnessEnvironmentKey(),
                    },
                  },
                },
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS,
            AGENT.CODEX,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.HOOKS,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.SESSION_START,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT,
          ),
        },
      ];

      for (const { productConfig, expectedErrorPath } of malformedSections) {
        await withTestEnv(productConfig, async ({ productDir }) => {
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain(expectedErrorPath);
            expect(RESULT_VALUE_KEY in result).toBe(false);
          }
        });
      }
    });

    it("rejects instruction file entries with an empty target-agent list", async () => {
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [],
              },
            ],
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(
            harnessEnvironmentPath(
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
              "0",
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS,
            ),
          );
          expect(RESULT_VALUE_KEY in result).toBe(false);
        }
      });
    });

    it("rejects instruction file entries with duplicate target agents", async () => {
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CODEX, AGENT.CODEX],
              },
            ],
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(
            harnessEnvironmentPath(
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
              "0",
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS,
              "1",
            ),
          );
          expect(RESULT_VALUE_KEY in result).toBe(false);
        }
      });
    });

    it("rejects malformed instruction file entries", async () => {
      const unknownAgent = sampleUnknownAgent();
      const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CODEX],
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [unknownAgent],
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS,
            "0",
          ),
        },
      ];

      for (const { productConfig, expectedErrorPath } of malformedSections) {
        await withTestEnv(productConfig, async ({ productDir }) => {
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain(expectedErrorPath);
            expect(RESULT_VALUE_KEY in result).toBe(false);
          }
        });
      }
    });

    it("allows instruction targets to reference disabled agents", async () => {
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CODEX],
              },
            ],
          },
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {
            [AGENT.CODEX]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: false,
            },
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const harnessEnvironment = result.value[HARNESS_ENVIRONMENT_SECTION] as HarnessEnvironmentConfig;

        expect(harnessEnvironment.instructions.files[0]?.targetAgents).toEqual([AGENT.CODEX]);
      });
    });

    it("rejects malformed marketplace, plugin, and skill entries", async () => {
      const entryName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: entryName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: entryName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT,
          ),
        },
      ];

      for (const { productConfig, expectedErrorPath } of malformedSections) {
        await withTestEnv(productConfig, async ({ productDir }) => {
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain(expectedErrorPath);
            expect(RESULT_VALUE_KEY in result).toBe(false);
          }
        });
      }
    });

    it("rejects duplicate marketplace names for the same agent", async () => {
      const marketplaceName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const source = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
              },
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
              },
            ],
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(
            harnessEnvironmentPath(
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES,
              "1",
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
            ),
          );
          expect(RESULT_VALUE_KEY in result).toBe(false);
        }
      });
    });

    it("rejects duplicate plugin and skill names for the same agent", async () => {
      const pluginName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const skillName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const duplicateSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                  },
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
            "1",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
                  },
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
            "1",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
          ),
        },
      ];

      for (const { productConfig, expectedErrorPath } of duplicateSections) {
        await withTestEnv(productConfig, async ({ productDir }) => {
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain(expectedErrorPath);
            expect(RESULT_VALUE_KEY in result).toBe(false);
          }
        });
      }
    });

    it("rejects duplicate bootstrap names across marketplaces, plugins, and skills for the same agent", async () => {
      const duplicateName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const source = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
      const duplicateSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: duplicateName,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
                  },
                ],
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: duplicateName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: duplicateName,
                  },
                ],
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: duplicateName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: duplicateName,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
                  },
                ],
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: duplicateName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME,
          ),
        },
      ];

      for (const { productConfig, expectedErrorPath } of duplicateSections) {
        await withTestEnv(productConfig, async ({ productDir }) => {
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain(expectedErrorPath);
            expect(RESULT_VALUE_KEY in result).toBe(false);
          }
        });
      }
    });

    it("rejects plugin marketplace references that are not configured for the same agent", async () => {
      const marketplaceName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const pluginName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const source = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
      const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE]: marketplaceName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
                  },
                ],
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE]: marketplaceName,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
            "0",
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE,
          ),
        },
      ];

      for (const { productConfig, expectedErrorPath } of malformedSections) {
        await withTestEnv(productConfig, async ({ productDir }) => {
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain(expectedErrorPath);
            expect(RESULT_VALUE_KEY in result).toBe(false);
          }
        });
      }
    });

    it("accepts plugin marketplace references configured for the same agent", async () => {
      const marketplaceName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const pluginName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const source = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
              },
            ],
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE]: marketplaceName,
              },
            ],
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

        expect(result.ok).toBe(true);
      });
    });

    it("accepts minimal and optional bootstrap entry shapes", async () => {
      const pluginName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const pluginVersionOnlyName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const pluginVersion = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
      const skillName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const skillVersion = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
              },
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginVersionOnlyName,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION]: pluginVersion,
              },
            ],
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION]: skillVersion,
              },
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
              },
            ],
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

        expect(result.ok).toBe(true);
      });
    });

    it("accepts multiple instruction files with different agent target subsets", async () => {
      const firstPath = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const secondPath = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: firstPath,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CODEX],
              },
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: secondPath,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CLAUDE_CODE],
              },
            ],
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const harnessEnvironment = result.value[HARNESS_ENVIRONMENT_SECTION] as HarnessEnvironmentConfig;

        expect(harnessEnvironment.instructions.files).toEqual([
          {
            path: firstPath,
            targetAgents: [AGENT.CODEX],
          },
          {
            path: secondPath,
            targetAgents: [AGENT.CLAUDE_CODE],
          },
        ]);
      });
    });

    it("rejects duplicate instruction file paths", async () => {
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CODEX],
              },
              {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CLAUDE_CODE],
              },
            ],
          },
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(
            harnessEnvironmentPath(
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
              "1",
              HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH,
            ),
          );
          expect(RESULT_VALUE_KEY in result).toBe(false);
        }
      });
    });

    it("rejects unknown descriptor fields instead of dropping configured intent", async () => {
      const unknownField = sampleUnknownHarnessEnvironmentField();
      const productConfig: Config = {
        [HARNESS_ENVIRONMENT_SECTION]: {
          [unknownField]: sampleUnknownHarnessEnvironmentValue(),
        },
      };

      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(harnessEnvironmentPath(unknownField));
          expect(RESULT_VALUE_KEY in result).toBe(false);
        }
      });
    });

    it("rejects unknown nested descriptor fields instead of dropping configured intent", async () => {
      const key = sampleHarnessEnvironmentKey();
      const unknownField = sampleUnknownHarnessEnvironmentField();
      const unknownValue = sampleUnknownHarnessEnvironmentValue();
      const nestedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [],
                [unknownField]: unknownValue,
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS, unknownField),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [AGENT.CODEX],
                    [unknownField]: unknownValue,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES,
            "0",
            unknownField,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {
                [AGENT.CODEX]: {
                  [HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: true,
                  [unknownField]: unknownValue,
                },
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS,
            AGENT.CODEX,
            unknownField,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [unknownField]: unknownValue,
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP, unknownField),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: key,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: unknownValue,
                    [unknownField]: unknownValue,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES,
            "0",
            unknownField,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: key,
                    [unknownField]: unknownValue,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
            "0",
            unknownField,
          ),
        },
        {
          productConfig: {
            [HARNESS_ENVIRONMENT_SECTION]: {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
                [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
                  {
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
                    [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: key,
                    [unknownField]: unknownValue,
                  },
                ],
              },
            },
          },
          expectedErrorPath: harnessEnvironmentPath(
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
            HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
            "0",
            unknownField,
          ),
        },
      ];

      for (const { productConfig, expectedErrorPath } of nestedSections) {
        await withTestEnv(productConfig, async ({ productDir }) => {
          const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toContain(expectedErrorPath);
            expect(RESULT_VALUE_KEY in result).toBe(false);
          }
        });
      }
    });
  });
}

runHarnessEnvironmentDescriptorComplianceTests();
