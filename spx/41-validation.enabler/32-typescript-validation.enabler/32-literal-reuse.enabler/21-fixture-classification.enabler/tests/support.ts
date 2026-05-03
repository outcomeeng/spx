import { DEFAULT_MIN_NUMBER_DIGITS, DEFAULT_MIN_STRING_LENGTH } from "@/validation/literal/config";
import { collectLiterals, defaultVisitorKeys, type LiteralOccurrence } from "@/validation/literal/index";

const detectorOptions = {
  visitorKeys: defaultVisitorKeys,
  minStringLength: DEFAULT_MIN_STRING_LENGTH,
  minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
};

export function collectFromFile(
  source: string,
  filename: string,
): readonly LiteralOccurrence[] {
  return collectLiterals(source, filename, detectorOptions);
}
