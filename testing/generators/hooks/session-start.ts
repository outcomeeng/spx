import fc, { type Arbitrary } from "fast-check";

import { isHookEvent } from "@/interfaces/hooks/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

export function arbitraryUnknownHookEvent(): Arbitrary<string> {
  return arbitraryDomainLiteral().filter((event) => !isHookEvent(event));
}

const DIRECTIVE_MIN_LINES = 1;
const DIRECTIVE_MAX_LINES = 4;
const DIRECTIVE_LINE_SEPARATOR = "\n";

/** Multi-line compact-recovery directive text: the domain a methodology package's directive resource draws from. */
export function arbitraryCompactDirectiveText(): Arbitrary<string> {
  return fc
    .array(arbitraryDomainLiteral(), { minLength: DIRECTIVE_MIN_LINES, maxLength: DIRECTIVE_MAX_LINES })
    .map((lines) => lines.join(DIRECTIVE_LINE_SEPARATOR) + DIRECTIVE_LINE_SEPARATOR);
}
