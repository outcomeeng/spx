import * as fc from "fast-check";

import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { SESSION_CLI } from "@/interfaces/cli/session";
import { validationCliDefinition, validationCommonCliOptions } from "@/interfaces/cli/validation-contract";
import { KIND_REGISTRY } from "@/lib/spec-tree";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  CONFIG_TEST_GENERATOR,
  type GeneratedDirectoryScope,
  type GeneratedTestingConfig,
} from "@testing/generators/config/descriptors";
import { arbitrarySessionId } from "@testing/generators/session/session";
import { type RepresentativeSpecTreeFixture, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { arbitrarySpecTreeLinkScenario, type SpecTreeLinkScenario } from "@testing/generators/validation/markdown";

export const PRODUCT_CONTEXT_MAPPING_COMMANDS = [
  {
    directoryOption: SPX_GLOBAL_OPTIONS.directory.short,
    domain: CONFIG_CLI.commandName,
    args: [CONFIG_CLI.commandName, CONFIG_CLI.commands.show, CONFIG_CLI.flags.json],
  },
  {
    directoryOption: SPX_GLOBAL_OPTIONS.directory.short,
    domain: validationCliDefinition.domain.commandName,
    args: [
      validationCliDefinition.domain.commandName,
      validationCliDefinition.subcommands.typescript.commandName,
      validationCommonCliOptions.scope.flag,
      VALIDATION_SCOPES.FULL,
    ],
  },
  {
    directoryOption: SPX_GLOBAL_OPTIONS.directory.short,
    domain: SESSION_CLI.commandName,
    args: [SESSION_CLI.commandName, SESSION_CLI.commands.list, SESSION_CLI.flags.json],
  },
  {
    directoryOption: undefined,
    domain: CONFIG_CLI.commandName,
    args: [CONFIG_CLI.commandName, CONFIG_CLI.commands.validate],
  },
] as const;

export type ProductContextMappingCommand = (typeof PRODUCT_CONTEXT_MAPPING_COMMANDS)[number];
export type RedirectedProductContextCommand = Extract<
  ProductContextMappingCommand,
  { readonly directoryOption: string }
>;

/**
 * The diagnostic the product promises when a command runs outside a git worktree,
 * spelled here rather than read from the module that emits it. An oracle importing
 * production's own composition moves with any wording change and can never fail on
 * one; this one fails the moment the emitted warning stops saying what is declared.
 */
export function expectedProductDirFallbackWarning(processDir: string): string {
  return `warning: ${processDir} is not inside a git worktree`
    + ` — falling back to the current working directory. not a git repository.`;
}

export interface GeneratedProductContextCase {
  readonly target: GeneratedDirectoryScope;
  readonly caller: GeneratedDirectoryScope;
  readonly testing: GeneratedTestingConfig;
  readonly sessionId: string;
  readonly source: { readonly filename: string; readonly contents: string };
}

export function arbitraryProductContextCase(): fc.Arbitrary<GeneratedProductContextCase> {
  return fc.record({
    target: CONFIG_TEST_GENERATOR.directoryScope(),
    caller: CONFIG_TEST_GENERATOR.directoryScope(),
    testing: CONFIG_TEST_GENERATOR.discriminatingTestingConfig(),
    sessionId: arbitrarySessionId(),
    source: fc.tuple(CONFIG_TEST_GENERATOR.key(), CONFIG_TEST_GENERATOR.scalar()).map(([name, value]) => ({
      filename: `${name}.ts`,
      contents: `export default ${JSON.stringify(value)};\n`,
    })),
  });
}

/**
 * One product's own state: the configuration it declares, the spec tree it holds, and the broken
 * markdown link it carries, each drawn so the other product's state differs.
 */
export interface GeneratedProductLayer {
  readonly testing: GeneratedTestingConfig;
  readonly tree: RepresentativeSpecTreeFixture;
  readonly markdown: SpecTreeLinkScenario;
}

/**
 * A product nested inside an enclosing repository's product, both holding their own configuration,
 * spec tree, and markdown violation. `nested.productDirectory` places the inner product under the
 * enclosing root and `nested.nestedDirectory` names a directory inside the inner product.
 */
export interface GeneratedNestedProductContextCase {
  readonly nested: GeneratedDirectoryScope;
  readonly caller: GeneratedDirectoryScope;
  readonly enclosing: GeneratedProductLayer;
  readonly inner: GeneratedProductLayer;
}

function arbitraryProductLayer(): fc.Arbitrary<GeneratedProductLayer> {
  return fc.record({
    testing: CONFIG_TEST_GENERATOR.discriminatingTestingConfig(),
    tree: SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY),
    markdown: arbitrarySpecTreeLinkScenario(),
  });
}

function layersDiffer(first: GeneratedProductLayer, second: GeneratedProductLayer): boolean {
  return JSON.stringify(first.testing.config) !== JSON.stringify(second.testing.config)
    && first.tree.root.slug !== second.tree.root.slug
    && first.tree.child.slug !== second.tree.child.slug
    && first.tree.peer.slug !== second.tree.peer.slug
    && !first.markdown.citingFileName.endsWith(second.markdown.citingFileName)
    && !second.markdown.citingFileName.endsWith(first.markdown.citingFileName);
}

export function arbitraryNestedProductContextCase(): fc.Arbitrary<GeneratedNestedProductContextCase> {
  return fc
    .record({
      nested: CONFIG_TEST_GENERATOR.directoryScope(),
      caller: CONFIG_TEST_GENERATOR.directoryScope(),
      enclosing: arbitraryProductLayer(),
      inner: arbitraryProductLayer(),
    })
    .filter(({ enclosing, inner }) => layersDiffer(enclosing, inner));
}
