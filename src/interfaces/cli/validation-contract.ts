import { LITERAL_PROBLEM_KIND, type LiteralProblemKind } from "@/domains/validation/literal-problem-kind";

export const VALIDATION_EMPTY_CLI_OPERAND = "";
export const VALIDATION_OPTION_OPERAND_SEPARATOR = " ";

interface ValidationDomainCommandDefinition {
  readonly commandName: string;
  readonly alias: string;
  readonly description: string;
}

export interface ValidationSubcommandDefinition {
  readonly commandName: string;
  readonly alias?: string;
  readonly description: string;
}

interface ValidationCliDefinition {
  readonly domain: ValidationDomainCommandDefinition;
  readonly subcommands: {
    readonly typescript: ValidationSubcommandDefinition;
    readonly lint: ValidationSubcommandDefinition;
    readonly circular: ValidationSubcommandDefinition;
    readonly knip: ValidationSubcommandDefinition;
    readonly literal: ValidationSubcommandDefinition;
    readonly markdown: ValidationSubcommandDefinition;
    readonly format: ValidationSubcommandDefinition;
    readonly all: ValidationSubcommandDefinition;
  };
  readonly commanderHelpOperands: {
    readonly subcommand: string;
    readonly longFlag: string;
    readonly shortFlag: string;
  };
  readonly pathOperands: {
    readonly optionalVariadic: string;
    readonly description: string;
  };
  readonly diagnostics: {
    readonly unknownSubcommand: {
      readonly messageLabel: string;
      readonly exitCode: number;
    };
    readonly unknownLiteralProblemKind: {
      readonly messageLabel: string;
      readonly exitCode: number;
    };
    readonly invalidPathOperand: {
      readonly messageLabel: string;
      readonly reason: string;
      readonly exitCode: number;
    };
  };
}

export const validationLiteralProblemKinds = [
  LITERAL_PROBLEM_KIND.REUSE,
  LITERAL_PROBLEM_KIND.DUPE,
] as const;

export const validationCliDefinition: ValidationCliDefinition = {
  domain: {
    commandName: "validation",
    alias: "v",
    description: "Run code validation tools",
  },
  subcommands: {
    typescript: {
      commandName: "typescript",
      alias: "ts",
      description: "Run TypeScript type checking",
    },
    lint: {
      commandName: "lint",
      description: "Run ESLint",
    },
    circular: {
      commandName: "circular",
      description: "Check for circular dependencies",
    },
    knip: {
      commandName: "knip",
      description: "Detect unused code",
    },
    literal: {
      commandName: "literal",
      description: "Detect cross-file literal reuse between source and tests",
    },
    markdown: {
      commandName: "markdown",
      alias: "md",
      description: "Validate markdown link integrity and structure",
    },
    format: {
      commandName: "format",
      description: "Check code formatting with dprint",
    },
    all: {
      commandName: "all",
      description: "Run all validations",
    },
  },
  commanderHelpOperands: {
    subcommand: "help",
    longFlag: "--help",
    shortFlag: "-h",
  },
  pathOperands: {
    optionalVariadic: "[paths...]",
    description: "Specific files/directories to validate",
  },
  diagnostics: {
    unknownSubcommand: {
      messageLabel: "unknown subcommand",
      exitCode: 1,
    },
    unknownLiteralProblemKind: {
      messageLabel: "unknown problem kind",
      exitCode: 1,
    },
    invalidPathOperand: {
      messageLabel: "invalid path operand",
      reason: "escapes product directory",
      exitCode: 1,
    },
  },
} as const;

export const literalValidationCliOptions = {
  allowlistExisting: {
    flag: "--allowlist-existing",
    description: "Append every current problem's value to validation.literal.values.include and exit",
  },
  kind: {
    flag: "--kind <kind>",
    description: `Only report one problem kind (${validationLiteralProblemKinds.join("|")})`,
  },
  filesWithProblems: {
    flag: "--files-with-problems",
    description: "Print each affected file path once",
  },
  literals: {
    flag: "--literals",
    description: "Print each affected literal value once",
  },
  verbose: {
    flag: "--verbose",
    description: "Print grouped problem details",
  },
} as const;

export const validationCommonCliOptions = {
  scope: {
    flag: "--scope",
  },
  quiet: {
    flag: "--quiet",
  },
  json: {
    flag: "--json",
  },
} as const;

export const validationAllBuiltInCliOptions = {
  fix: {
    flag: "--fix",
  },
} as const;

export function isValidationLiteralProblemKind(value: string): value is LiteralProblemKind {
  return validationLiteralProblemKinds.some((kind) => kind === value);
}

const validationSubcommandOperands = Object.values(validationCliDefinition.subcommands).flatMap(
  (subcommand) => {
    const operands = [subcommand.commandName];
    if (subcommand.alias !== undefined) operands.push(subcommand.alias);
    return operands;
  },
);

export const validationKnownOperands: ReadonlySet<string> = new Set([
  ...validationSubcommandOperands,
  ...Object.values(validationCliDefinition.commanderHelpOperands),
]);
export const validationOptionPrefix = validationCliDefinition.commanderHelpOperands.longFlag.slice(0, 2);
