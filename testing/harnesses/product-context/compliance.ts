import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { configFileForFormat, DEFAULT_CONFIG_FILE_FORMAT, serializeConfigFileSections } from "@/config/index";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import type {
  GeneratedNestedProductContextCase,
  GeneratedProductContextCase,
} from "@testing/generators/config/product-context";
import { markdownBrokenRelativeLink } from "@testing/generators/validation/markdown";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { type ProductContextCliRun, runProductContextCli } from "@testing/harnesses/product-context/cli";
import { materializeSpecTreeFixtureAt, withSpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const DIRTY_CALLER_TEMP_PREFIX = "spx-dirty-product-caller-";

export async function observeDirtyCallerProductContext(scenario: GeneratedProductContextCase): Promise<{
  readonly productDir: string;
  readonly result: ProductContextCliRun;
}> {
  return withTempDir(DIRTY_CALLER_TEMP_PREFIX, async (callerRoot) => {
    const callerDir = join(callerRoot, scenario.caller.productDirectory, scenario.caller.nestedDirectory);
    await mkdir(callerDir, { recursive: true });
    await runGit(callerDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    await writeFile(join(callerDir, scenario.source.filename), scenario.source.contents);

    return withTestEnv(scenario.testing.config, async ({ productDir }) => {
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
      const result = await runProductContextCli(
        [
          SPX_GLOBAL_OPTIONS.directory.short,
          productDir,
          CONFIG_CLI.commandName,
          CONFIG_CLI.commands.show,
          CONFIG_CLI.flags.json,
        ],
        { processCwd: callerDir },
      );
      return { productDir, result };
    });
  });
}

const NESTED_CALLER_TEMP_PREFIX = "spx-nested-product-caller-";

export interface NestedProductContextObservation {
  readonly innerProductDir: string;
  readonly enclosingProductDir: string;
  readonly config: ProductContextCliRun;
  readonly markdown: ProductContextCliRun;
  readonly status: ProductContextCliRun;
}

/**
 * Builds an enclosing git repository holding a product of its own, with a second product nested
 * inside it, then runs `config show`, `validation markdown`, and `spec status` through `-C` naming a
 * directory inside the nested product, from a process directory outside both.
 */
export async function observeNestedProductContext(
  scenario: GeneratedNestedProductContextCase,
): Promise<NestedProductContextObservation> {
  let observation: NestedProductContextObservation | undefined;
  await withSpecTreeEnv(scenario.enclosing.testing.config, async (env) => {
    await env.materialize();
    const enclosingLink = markdownBrokenRelativeLink(
      scenario.enclosing.markdown,
      scenario.enclosing.markdown.nodeDirectory,
    );
    await env.writeRaw(enclosingLink.citingFile, enclosingLink.content);

    const innerProductDir = join(env.productDir, scenario.nested.productDirectory);
    const configFile = configFileForFormat(innerProductDir, DEFAULT_CONFIG_FILE_FORMAT);
    const serialized = serializeConfigFileSections(configFile.format, scenario.inner.testing.config);
    if (!serialized.ok) throw new Error(serialized.error);
    await env.writeRaw(join(scenario.nested.productDirectory, configFile.filename), serialized.value);
    await materializeSpecTreeFixtureAt(env, scenario.nested.productDirectory, scenario.inner.tree);
    const innerLink = markdownBrokenRelativeLink(scenario.inner.markdown, scenario.inner.markdown.nodeDirectory);
    await env.writeRaw(join(scenario.nested.productDirectory, innerLink.citingFile), innerLink.content);

    const invocationDir = join(innerProductDir, scenario.nested.nestedDirectory);
    await mkdir(invocationDir, { recursive: true });
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);

    await withTempDir(NESTED_CALLER_TEMP_PREFIX, async (callerRoot) => {
      const callerDir = join(callerRoot, scenario.caller.productDirectory, scenario.caller.nestedDirectory);
      await mkdir(callerDir, { recursive: true });
      const run = (args: readonly string[]): Promise<ProductContextCliRun> =>
        runProductContextCli([SPX_GLOBAL_OPTIONS.directory.short, invocationDir, ...args], { processCwd: callerDir });
      observation = {
        innerProductDir,
        enclosingProductDir: env.productDir,
        config: await run([CONFIG_CLI.commandName, CONFIG_CLI.commands.show, CONFIG_CLI.flags.json]),
        markdown: await run([
          validationCliDefinition.domain.commandName,
          validationCliDefinition.subcommands.markdown.commandName,
        ]),
        status: await run([SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.STATUS_COMMAND, SPEC_DOMAIN_CLI.JSON_OPTION]),
      };
    });
  }, { fixture: scenario.enclosing.tree });
  if (observation === undefined) throw new Error("Nested product context observation was not captured");
  return observation;
}
