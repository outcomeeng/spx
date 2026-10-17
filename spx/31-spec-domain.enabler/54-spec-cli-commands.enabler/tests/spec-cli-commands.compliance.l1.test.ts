import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { SPEC_CONTEXT_COMMAND_PATH, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import {
  RETIRED_SPEC_CONTEXT_OPTION_FIXTURES,
  specCliProtectedConfigFiles,
} from "@testing/generators/spec-tree/spec-cli";
import { addNodeTestFile, fixtureNodePath } from "@testing/harnesses/spec-tree/spec-cli-commands";
import { runSpecDescriptor, specDescriptorOptionFlags, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context commands and retired options", () => {
  it("NEVER: spx spec context show or spx spec context list registers a --content or --understand option", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (const commandPath of Object.values(SPEC_CONTEXT_COMMAND_PATH)) {
        const registered = specDescriptorOptionFlags(commandPath);
        // The observation reaches the descriptor's real option surface: both
        // context commands declare --json, so an empty read cannot pass.
        expect(registered, commandPath.join(" ")).toContain(SPEC_DOMAIN_CLI.JSON_OPTION);
        for (const retired of RETIRED_SPEC_CONTEXT_OPTION_FIXTURES) {
          expect(registered, `${commandPath.join(" ")} ${retired.option}`).not.toContain(retired.option);
          const refused = await runSpecDescriptor(
            { productDir: env.productDir },
            ...commandPath,
            paths.targetId,
            retired.option,
          );
          expect(refused.parseError, `${commandPath.join(" ")} ${retired.option}`).toBeDefined();
          expect(refused.stdout, `${commandPath.join(" ")} ${retired.option}`).toHaveLength(0);
          expect(refused.stderr, `${commandPath.join(" ")} ${retired.option}`).toContain(retired.option);
        }
      }
    });
  });
});

describe("spec command handlers and product configuration", () => {
  it("NEVER: status, status --update, next, context list, or context show writes a product configuration file", async () => {
    await withRichContextEnv(async (env, paths) => {
      // A node carrying a test file reaches the --update fold, so every
      // handler path the rule governs runs against the protected files.
      await addNodeTestFile(env, fixtureNodePath(env.fixture.peer));
      const protectedFiles = specCliProtectedConfigFiles(env.fixture);
      for (const file of protectedFiles) await env.writeRaw(file.path, file.content);
      const protectedPaths = [DEFAULT_CONFIG_FILENAME, ...protectedFiles.map((file) => file.path)];
      const before = await Promise.all(protectedPaths.map((path) => env.readFile(path)));
      const invocations: readonly (readonly string[])[] = [
        [SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.STATUS_COMMAND],
        [SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.STATUS_COMMAND, SPEC_DOMAIN_CLI.UPDATE_OPTION],
        [SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.NEXT_COMMAND],
        [
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_LIST_COMMAND,
          paths.targetId,
        ],
        [SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.CONTEXT_COMMAND, SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND],
        [
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
          paths.targetId,
        ],
      ];
      for (const argv of invocations) {
        const run = await runSpecDescriptor({ productDir: env.productDir }, ...argv);
        // Each handler ran to completion, so the read-back judges real work.
        expect(run.exitCode, `${argv.join(" ")}: ${run.stderr}`).toBeUndefined();
        expect(run.stdout.length, argv.join(" ")).toBeGreaterThan(0);
        expect(await Promise.all(protectedPaths.map((path) => env.readFile(path))), argv.join(" ")).toEqual(before);
      }
    });
  });
});
