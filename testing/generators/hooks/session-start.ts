import type { Arbitrary } from "fast-check";

import { isHookEvent } from "@/interfaces/hooks/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

export function arbitraryUnknownHookEvent(): Arbitrary<string> {
  return arbitraryDomainLiteral().filter((event) => !isHookEvent(event));
}
