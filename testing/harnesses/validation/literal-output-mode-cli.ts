import { OUTPUT_MODE_NAME, type OutputModeName } from "@/commands/validation/literal";
import { LITERAL_PROBLEM_KIND } from "@/domains/validation/literal-problem-kind";
import {
  literalValidationCliOptions,
  validationCliDefinition,
  validationCommonCliOptions,
} from "@/interfaces/cli/validation-contract";
import { validationCliOptionName } from "@testing/harnesses/validation/cli";

export function literalOutputModeCliArgs(mode: OutputModeName): string[] {
  const args = [
    validationCliDefinition.subcommands.literal.commandName,
    validationCliOptionName(literalValidationCliOptions.kind),
    LITERAL_PROBLEM_KIND.REUSE,
  ];
  switch (mode) {
    case OUTPUT_MODE_NAME.TEXT:
      return args;
    case OUTPUT_MODE_NAME.VERBOSE:
      return [...args, literalValidationCliOptions.verbose.flag];
    case OUTPUT_MODE_NAME.FILES_WITH_PROBLEMS:
      return [...args, literalValidationCliOptions.filesWithProblems.flag];
    case OUTPUT_MODE_NAME.LITERALS:
      return [...args, literalValidationCliOptions.literals.flag];
    case OUTPUT_MODE_NAME.JSON:
      return [...args, validationCommonCliOptions.json.flag];
  }
}
