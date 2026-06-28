import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { productionRegistry } from "@/config/registry";
import { RESULT_VALUE_KEY } from "@/config/types";
import {
  AGENT_ENVIRONMENT_CONFIG_FIELDS,
  AGENT_ENVIRONMENT_SECTION,
  AGENT_RUNTIME,
  type AgentEnvironmentConfig,
  agentEnvironmentConfigDescriptor,
  DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
} from "@/domains/agent-environment/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function sampleUnknownAgentRuntime() {
  return `unregistered-${sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())}`;
}

function sampleUnknownAgentEnvironmentField() {
  return `unknown-${sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())}`;
}

function sampleUnknownAgentEnvironmentValue() {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
}

function sampleAgentEnvironmentKey() {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
}

function expectResolvedConfig(result: Awaited<ReturnType<typeof resolveConfig>>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function agentEnvironmentPath(...segments: readonly string[]) {
  return [AGENT_ENVIRONMENT_SECTION, ...segments].join(".");
}

function expectRejectedConfig(result: Awaited<ReturnType<typeof resolveConfig>>, expectedErrorPath: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(expectedErrorPath);
    expect(RESULT_VALUE_KEY in result).toBe(false);
  }
}

function assertAgentEnvironmentConfig(value: unknown): AgentEnvironmentConfig {
  expect(value).toHaveProperty(AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS);
  expect(value).toHaveProperty(AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES);
  expect(value).toHaveProperty(AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP);
  return value as AgentEnvironmentConfig;
}

describe("agent environment config descriptor", () => {
  it("registers the agent environment section in the default production config registry", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.agentEnvironmentConfig());

    await withTestEnv(generated.config, async ({ productDir }) => {
      const result = await resolveConfig(productDir);
      const config = expectResolvedConfig(result);
      const agentEnvironment = assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION]);

      expect(agentEnvironment).toEqual(generated.expected);
    });
  });

  it("resolves descriptor defaults for omitted agent environment config", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = await resolveConfig(productDir, productionRegistry);
      const config = expectResolvedConfig(result);

      expect(assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION])).toEqual(
        agentEnvironmentConfigDescriptor.defaults,
      );
    });
  });

  it("resolves default runtimes for an explicit empty runtimes section", async () => {
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {},
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);
      const config = expectResolvedConfig(result);
      const agentEnvironment = assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION]);

      expect(agentEnvironment.runtimes).toEqual(agentEnvironmentConfigDescriptor.defaults.runtimes);
    });
  });

  it("resolves per-runtime hook policy defaults", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);
      const config = expectResolvedConfig(result);
      const agentEnvironment = assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION]);

      expect(agentEnvironment.runtimes[AGENT_RUNTIME.CODEX].hooks.sessionStart.compactStdout).toBe(false);
      expect(agentEnvironment.runtimes[AGENT_RUNTIME.CLAUDE_CODE].hooks.sessionStart.compactStdout).toBe(true);
    });
  });

  it("resolves explicit runtime hook policy overrides", async () => {
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {
          [AGENT_RUNTIME.CODEX]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.HOOKS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SESSION_START]: {
                [AGENT_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT]: true,
              },
            },
          },
          [AGENT_RUNTIME.CLAUDE_CODE]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.HOOKS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SESSION_START]: {
                [AGENT_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT]: false,
              },
            },
          },
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);
      const config = expectResolvedConfig(result);
      const agentEnvironment = assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION]);

      expect(agentEnvironment.runtimes[AGENT_RUNTIME.CODEX].hooks.sessionStart.compactStdout).toBe(true);
      expect(agentEnvironment.runtimes[AGENT_RUNTIME.CLAUDE_CODE].hooks.sessionStart.compactStdout).toBe(false);
    });
  });

  it("resolves default instruction files for an explicit empty instructions section", async () => {
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {},
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);
      const config = expectResolvedConfig(result);
      const agentEnvironment = assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION]);

      expect(agentEnvironment.instructions).toEqual(agentEnvironmentConfigDescriptor.defaults.instructions);
    });
  });

  it("allows an empty instruction file list to disable instruction file management", async () => {
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [],
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);
      const config = expectResolvedConfig(result);
      const agentEnvironment = assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION]);

      expect(agentEnvironment.instructions.files).toEqual([]);
    });
  });

  it("rejects unregistered runtime ids before child reconcilers run", async () => {
    const unknownRuntime = sampleUnknownAgentRuntime();
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {
          [unknownRuntime]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: true,
          },
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

      expectRejectedConfig(result, agentEnvironmentPath(AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES, unknownRuntime));
    });
  });

  it("rejects non-object descriptor subsections", async () => {
    const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: sampleUnknownAgentEnvironmentValue(),
          },
        },
        expectedErrorPath: agentEnvironmentPath(AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: [AGENT_RUNTIME.CODEX],
          },
        },
        expectedErrorPath: agentEnvironmentPath(AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: true,
          },
        },
        expectedErrorPath: agentEnvironmentPath(AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP),
      },
    ];

    for (const { productConfig, expectedErrorPath } of malformedSections) {
      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

        expectRejectedConfig(result, expectedErrorPath);
      });
    }
  });

  it("rejects malformed subsection field values", async () => {
    const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: sampleAgentEnvironmentKey(),
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: "",
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CODEX],
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {
              [AGENT_RUNTIME.CODEX]: {
                [AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: sampleAgentEnvironmentKey(),
              },
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES,
          AGENT_RUNTIME.CODEX,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {
              [AGENT_RUNTIME.CODEX]: {
                [AGENT_ENVIRONMENT_CONFIG_FIELDS.HOOKS]: {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.SESSION_START]: {
                    [AGENT_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT]: sampleAgentEnvironmentKey(),
                  },
                },
              },
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES,
          AGENT_RUNTIME.CODEX,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.HOOKS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.SESSION_START,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT,
        ),
      },
    ];

    for (const { productConfig, expectedErrorPath } of malformedSections) {
      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

        expectRejectedConfig(result, expectedErrorPath);
      });
    }
  });

  it("rejects instruction file entries with an empty target runtime list", async () => {
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [],
            },
          ],
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

      expectRejectedConfig(
        result,
        agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES,
        ),
      );
    });
  });

  it("rejects instruction file entries with duplicate target runtimes", async () => {
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CODEX, AGENT_RUNTIME.CODEX],
            },
          ],
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

      expectRejectedConfig(
        result,
        agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES,
          "1",
        ),
      );
    });
  });

  it("rejects malformed instruction file entries", async () => {
    const unknownRuntime = sampleUnknownAgentRuntime();
    const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CODEX],
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [unknownRuntime],
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES,
          "0",
        ),
      },
    ];

    for (const { productConfig, expectedErrorPath } of malformedSections) {
      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

        expectRejectedConfig(result, expectedErrorPath);
      });
    }
  });

  it("allows instruction targets to reference disabled runtimes", async () => {
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CODEX],
            },
          ],
        },
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {
          [AGENT_RUNTIME.CODEX]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: false,
          },
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);
      const config = expectResolvedConfig(result);
      const agentEnvironment = assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION]);

      expect(agentEnvironment.instructions.files[0]?.targetRuntimes).toEqual([AGENT_RUNTIME.CODEX]);
    });
  });

  it("rejects malformed marketplace, plugin, and skill entries", async () => {
    const entryName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: entryName,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: entryName,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME,
        ),
      },
    ];

    for (const { productConfig, expectedErrorPath } of malformedSections) {
      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

        expectRejectedConfig(result, expectedErrorPath);
      });
    }
  });

  it("rejects duplicate marketplace names for the same runtime", async () => {
    const marketplaceName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const source = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
            },
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
            },
          ],
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

      expectRejectedConfig(
        result,
        agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES,
          "1",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME,
        ),
      );
    });
  });

  it("rejects duplicate plugin and skill names for the same runtime", async () => {
    const pluginName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const skillName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const duplicateSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                },
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
          "1",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
                },
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
          "1",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME,
        ),
      },
    ];

    for (const { productConfig, expectedErrorPath } of duplicateSections) {
      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

        expectRejectedConfig(result, expectedErrorPath);
      });
    }
  });

  it("rejects plugin marketplace references that are not configured for the same runtime", async () => {
    const marketplaceName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const pluginName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const source = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const malformedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE]: marketplaceName,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
                },
              ],
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE]: marketplaceName,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
          "0",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE,
        ),
      },
    ];

    for (const { productConfig, expectedErrorPath } of malformedSections) {
      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

        expectRejectedConfig(result, expectedErrorPath);
      });
    }
  });

  it("accepts plugin marketplace references configured for the same runtime", async () => {
    const marketplaceName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const pluginName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const source = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: source,
            },
          ],
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE]: marketplaceName,
            },
          ],
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

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
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
            },
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginVersionOnlyName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION]: pluginVersion,
            },
          ],
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION]: skillVersion,
            },
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
            },
          ],
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

      expect(result.ok).toBe(true);
    });
  });

  it("accepts multiple instruction files with different runtime target subsets", async () => {
    const firstPath = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const secondPath = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: firstPath,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CODEX],
            },
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: secondPath,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CLAUDE_CODE],
            },
          ],
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);
      const config = expectResolvedConfig(result);
      const agentEnvironment = assertAgentEnvironmentConfig(config[AGENT_ENVIRONMENT_SECTION]);

      expect(agentEnvironment.instructions.files).toEqual([
        {
          path: firstPath,
          targetRuntimes: [AGENT_RUNTIME.CODEX],
        },
        {
          path: secondPath,
          targetRuntimes: [AGENT_RUNTIME.CLAUDE_CODE],
        },
      ]);
    });
  });

  it("rejects duplicate instruction file paths", async () => {
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CODEX],
            },
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CLAUDE_CODE],
            },
          ],
        },
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

      expectRejectedConfig(
        result,
        agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
          "1",
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH,
        ),
      );
    });
  });

  it("rejects unknown descriptor fields instead of dropping configured intent", async () => {
    const unknownField = sampleUnknownAgentEnvironmentField();
    const productConfig: Config = {
      [AGENT_ENVIRONMENT_SECTION]: {
        [unknownField]: sampleUnknownAgentEnvironmentValue(),
      },
    };

    await withTestEnv(productConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

      expectRejectedConfig(result, agentEnvironmentPath(unknownField));
    });
  });

  it("rejects unknown nested descriptor fields instead of dropping configured intent", async () => {
    const key = sampleAgentEnvironmentKey();
    const unknownField = sampleUnknownAgentEnvironmentField();
    const unknownValue = sampleUnknownAgentEnvironmentValue();
    const nestedSections: readonly { readonly productConfig: Config; readonly expectedErrorPath: string }[] = [
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [],
              [unknownField]: unknownValue,
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS, unknownField),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [AGENT_RUNTIME.CODEX],
                  [unknownField]: unknownValue,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES,
          "0",
          unknownField,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {
              [AGENT_RUNTIME.CODEX]: {
                [AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: true,
                [unknownField]: unknownValue,
              },
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES,
          AGENT_RUNTIME.CODEX,
          unknownField,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [unknownField]: unknownValue,
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP, unknownField),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: key,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: unknownValue,
                  [unknownField]: unknownValue,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES,
          "0",
          unknownField,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: key,
                  [unknownField]: unknownValue,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS,
          "0",
          unknownField,
        ),
      },
      {
        productConfig: {
          [AGENT_ENVIRONMENT_SECTION]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
                {
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
                  [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: key,
                  [unknownField]: unknownValue,
                },
              ],
            },
          },
        },
        expectedErrorPath: agentEnvironmentPath(
          AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP,
          AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS,
          "0",
          unknownField,
        ),
      },
    ];

    for (const { productConfig, expectedErrorPath } of nestedSections) {
      await withTestEnv(productConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [agentEnvironmentConfigDescriptor]);

        expectRejectedConfig(result, expectedErrorPath);
      });
    }
  });
});
