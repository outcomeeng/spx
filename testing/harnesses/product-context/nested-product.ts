/**
 * A product nested inside an enclosing repository's product, for the `nested-product-target`
 * compliance of `spx/16-config.enabler/65-product-directory-api.enabler`: the nested product is a
 * copy of the enclosing one that differs in its `testing` config, its product title, one Node it
 * drops, and a broken link of its own, so each command's output shows which product it read. The
 * dropped Node keeps one test file in the enclosing product, so a test command that read the
 * enclosing tree would discover it.
 *
 * @module harnesses/product-context/nested-product
 */

import { cp, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configFileForFormat,
  DEFAULT_CONFIG_FILE_FORMAT,
  parseConfigFileSections,
  serializeConfigFileSections,
} from "@/config/index";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { SPEC_CONTEXT_COMMAND_PATH, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { EXECUTE_RUN_CLI_SURFACE, VERIFICATION_RUN_CLI_SURFACE } from "@/interfaces/cli/verify";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree/config";
import { TESTING_SECTION } from "@/test/config";
import type { GeneratedProductContextCase } from "@testing/generators/config/product-context";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { type ProductContextCliRun, runProductContextCli } from "@testing/harnesses/product-context/cli";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

const TITLE_LINE_PREFIX = "# ";
const NESTED_TITLE_PREFIX = "Nested ";
const ENCLOSING_BROKEN_LINK_FILE = "enclosing-only-broken-link.md";
const INNER_BROKEN_LINK_FILE = "nested-only-broken-link.md";
const BROKEN_LINK_CONTENT = "[missing](does-not-exist.md)\n";
const ENCLOSING_ONLY_TEST_FILE = "enclosing-only.scenario.l1.test.ts";
const ENCLOSING_ONLY_TEST_CONTENT = "export {};\n";
const TEST_VERIFICATION_TYPE = "test";
// The representative fixture is written in the 3.x grammar, so both products declare a 3.2 methodology.
const FIXTURE_METHODOLOGY = { [METHODOLOGY_CONFIG_FIELDS.VERSION]: "3.2" } as const;

/** The two products of one case: the enclosing product and the product nested inside it. */
export interface NestedProductTargetCase {
  readonly enclosing: GeneratedProductContextCase;
  readonly inner: GeneratedProductContextCase;
}

export interface NestedProductTargetObservation {
  readonly innerProductDir: string;
  /** The title of the nested product's product spec; the enclosing product's spec carries its own. */
  readonly innerTitle: string;
  readonly enclosingTitle: string;
  /** The title line of the nested product's spec, and of the enclosing product's, as each file holds it. */
  readonly innerTitleLine: string;
  readonly enclosingTitleLine: string;
  /** The Node directory the enclosing product holds and the nested product drops. */
  readonly droppedNode: string;
  /** The markdown file only the enclosing product's `spx/` holds, with a broken link. */
  readonly enclosingOnlyMarkdownFile: string;
  /** The markdown file only the nested product's `spx/` holds, with a broken link. */
  readonly innerOnlyMarkdownFile: string;
  readonly config: ProductContextCliRun;
  readonly markdown: ProductContextCliRun;
  readonly status: ProductContextCliRun;
  readonly context: ProductContextCliRun;
  /** `spec context show` with an operand naming the dropped Node in the enclosing product. */
  readonly outsideOperand: ProductContextCliRun;
  /** The operand naming the dropped Node in the enclosing product, which holds a test file there. */
  readonly outsideNodeOperand: string;
  /** `test` with the operand naming the dropped Node in the enclosing product. */
  readonly testOutsideOperand: ProductContextCliRun;
  /** `verification test run` with the operand naming the dropped Node in the enclosing product. */
  readonly verificationOutsideOperand: ProductContextCliRun;
}

async function productSpecFile(specDir: string): Promise<string> {
  const entries = await readdir(specDir, { withFileTypes: true });
  const spec = entries.find((entry) => entry.isFile() && entry.name.endsWith(SPEC_TREE_CONFIG.PRODUCT.SUFFIX));
  if (spec === undefined) throw new Error(`no product spec in ${specDir}`);
  return spec.name;
}

async function retitle(specPath: string, title: string): Promise<void> {
  const lines = (await readFile(specPath, "utf8")).split("\n");
  const titleIndex = lines.findIndex((line) => line.startsWith(TITLE_LINE_PREFIX));
  if (titleIndex === -1) throw new Error(`no title line in ${specPath}`);
  lines[titleIndex] = `${TITLE_LINE_PREFIX}${title}`;
  await writeFile(specPath, lines.join("\n"));
}

async function firstNodeDirectory(specDir: string): Promise<string> {
  const entries = await readdir(specDir, { withFileTypes: true });
  const node = entries.filter((entry) => entry.isDirectory() && /^\d/.test(entry.name)).map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .at(0);
  if (node === undefined) throw new Error(`no Node directory in ${specDir}`);
  return node;
}

/**
 * Builds the enclosing product in a fresh git repository, copies it into the nested directory the
 * inner case's caller scope names, applies the differences, and runs `config show --json`,
 * `validation markdown`, `spec status --json`, `spec context show`, and `spec context show`, `test`
 * and `verification test run` on an operand outside the nested product, each under `-C` naming the
 * nested product, from a process directory outside both.
 */
export async function observeNestedProductTarget(
  scenario: NestedProductTargetCase,
): Promise<NestedProductTargetObservation> {
  let observation: NestedProductTargetObservation | undefined;
  const enclosingConfig = { ...scenario.enclosing.testing.config, [METHODOLOGY_SECTION]: FIXTURE_METHODOLOGY };
  await withSpecTreeEnv(enclosingConfig, async (env) => {
    await env.materialize();
    const enclosingSpecDir = join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
    const innerProductDir = join(
      env.productDir,
      scenario.inner.caller.productDirectory,
      scenario.inner.caller.nestedDirectory,
    );
    const innerSpecDir = join(innerProductDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
    await mkdir(innerProductDir, { recursive: true });
    await cp(enclosingSpecDir, innerSpecDir, { recursive: true });

    const configFile = configFileForFormat(env.productDir, DEFAULT_CONFIG_FILE_FORMAT);
    const parsed = parseConfigFileSections(
      configFileForFormat(
        env.productDir,
        DEFAULT_CONFIG_FILE_FORMAT,
        await readFile(join(env.productDir, configFile.filename), "utf8"),
      ),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const innerConfig = { ...parsed.value, [TESTING_SECTION]: scenario.inner.testing.config[TESTING_SECTION] };
    const serialized = serializeConfigFileSections(configFile.format, innerConfig);
    if (!serialized.ok) throw new Error(serialized.error);
    await writeFile(join(innerProductDir, configFile.filename), serialized.value);

    const productSpec = await productSpecFile(enclosingSpecDir);
    const enclosingTitle = scenario.enclosing.caller.productDirectory;
    const innerTitle = `${NESTED_TITLE_PREFIX}${enclosingTitle}`;
    await retitle(join(enclosingSpecDir, productSpec), enclosingTitle);
    await retitle(join(innerSpecDir, productSpec), innerTitle);

    const droppedNode = await firstNodeDirectory(innerSpecDir);
    await rm(join(innerSpecDir, droppedNode), { recursive: true });

    await writeFile(join(enclosingSpecDir, ENCLOSING_BROKEN_LINK_FILE), BROKEN_LINK_CONTENT);
    await writeFile(join(innerSpecDir, INNER_BROKEN_LINK_FILE), BROKEN_LINK_CONTENT);
    const droppedNodeDir = join(enclosingSpecDir, droppedNode);
    const enclosingOnlyTestsDir = join(droppedNodeDir, SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME);
    await mkdir(enclosingOnlyTestsDir, { recursive: true });
    await writeFile(join(enclosingOnlyTestsDir, ENCLOSING_ONLY_TEST_FILE), ENCLOSING_ONLY_TEST_CONTENT);
    // Git reports canonical roots, so the test operand is canonical too: a test command rooted at the
    // enclosing toplevel would then discover the enclosing-only test file under it.
    const outsideNodeOperand = await realpath(droppedNodeDir);
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    // Spec commands read the tracked-path set, so every file of both products enters the index.
    await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, GIT_TEST_FLAGS.ALL]);

    const run = (args: readonly string[]): Promise<ProductContextCliRun> =>
      runProductContextCli([SPX_GLOBAL_OPTIONS.directory.short, innerProductDir, ...args], { processCwd: tmpdir() });
    observation = {
      innerProductDir,
      innerTitle,
      enclosingTitle,
      innerTitleLine: `${TITLE_LINE_PREFIX}${innerTitle}`,
      enclosingTitleLine: `${TITLE_LINE_PREFIX}${enclosingTitle}`,
      droppedNode,
      enclosingOnlyMarkdownFile: ENCLOSING_BROKEN_LINK_FILE,
      innerOnlyMarkdownFile: INNER_BROKEN_LINK_FILE,
      config: await run([CONFIG_CLI.commandName, CONFIG_CLI.commands.show, CONFIG_CLI.flags.json]),
      markdown: await run([
        validationCliDefinition.domain.commandName,
        validationCliDefinition.subcommands.markdown.commandName,
      ]),
      status: await run([SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.STATUS_COMMAND, SPEC_DOMAIN_CLI.JSON_OPTION]),
      context: await run([...SPEC_CONTEXT_COMMAND_PATH.SHOW]),
      outsideOperand: await run([...SPEC_CONTEXT_COMMAND_PATH.SHOW, droppedNodeDir]),
      outsideNodeOperand,
      testOutsideOperand: await run([TESTING_CLI.commandName, outsideNodeOperand]),
      verificationOutsideOperand: await run([
        VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
        TEST_VERIFICATION_TYPE,
        EXECUTE_RUN_CLI_SURFACE.runVerbName,
        outsideNodeOperand,
      ]),
    };
  });
  if (observation === undefined) throw new Error("nested product target observation was not captured");
  return observation;
}
