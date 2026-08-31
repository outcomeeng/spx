import fc, { type Arbitrary } from "fast-check";

import { isHookEvent } from "@/interfaces/hooks/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

export function arbitraryUnknownHookEvent(): Arbitrary<string> {
  return arbitraryDomainLiteral().filter((event) => !isHookEvent(event));
}

const DIRECTIVE_MIN_LINES = 1;
const DIRECTIVE_MAX_LINES = 4;
const DIRECTIVE_LINE_SEPARATOR = "\n";
const DIRECTIVE_MULTIBYTE_MARKERS = ["\u2713", "\u57fa\u76e4", "\u00fcber"] as const;

/**
 * Multi-line compact-recovery directive text over the resource's UTF-8 text
 * domain; multi-byte lines keep byte-fidelity defects observable.
 */
export function arbitraryCompactDirectiveText(): Arbitrary<string> {
  return fc
    .array(
      fc.oneof(
        arbitraryDomainLiteral(),
        fc
          .tuple(arbitraryDomainLiteral(), fc.constantFrom(...DIRECTIVE_MULTIBYTE_MARKERS))
          .map(([line, marker]) => `${line} ${marker}`),
      ),
      { minLength: DIRECTIVE_MIN_LINES, maxLength: DIRECTIVE_MAX_LINES },
    )
    .map((lines) => lines.join(DIRECTIVE_LINE_SEPARATOR) + DIRECTIVE_LINE_SEPARATOR);
}
