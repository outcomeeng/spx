import * as fc from "fast-check";

import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SESSION_CLI } from "@/interfaces/cli/session";
import { validationCliDefinition, validationCommonCliOptions } from "@/interfaces/cli/validation-contract";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  CONFIG_TEST_GENERATOR,
  type GeneratedDirectoryScope,
  type GeneratedTestingConfig,
} from "@testing/generators/config/descriptors";
import { arbitrarySessionId } from "@testing/generators/session/session";

export const PRODUCT_CONTEXT_MAPPING_COMMANDS = [
  {
    domain: CONFIG_CLI.commandName,
    args: [CONFIG_CLI.commandName, CONFIG_CLI.commands.show, CONFIG_CLI.flags.json],
  },
  {
    domain: validationCliDefinition.domain.commandName,
    args: [
      validationCliDefinition.domain.commandName,
      validationCliDefinition.subcommands.typescript.commandName,
      validationCommonCliOptions.scope.flag,
      VALIDATION_SCOPES.FULL,
    ],
  },
  {
    domain: SESSION_CLI.commandName,
    args: [SESSION_CLI.commandName, SESSION_CLI.commands.list, SESSION_CLI.flags.json],
  },
] as const;

export type ProductContextMappingCommand = (typeof PRODUCT_CONTEXT_MAPPING_COMMANDS)[number];

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
    testing: CONFIG_TEST_GENERATOR.testingConfig(),
    sessionId: arbitrarySessionId(),
    source: fc.tuple(CONFIG_TEST_GENERATOR.key(), CONFIG_TEST_GENERATOR.scalar()).map(([name, value]) => ({
      filename: `${name}.ts`,
      contents: `export default ${JSON.stringify(value)};\n`,
    })),
  });
}
