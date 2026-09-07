import type * as fc from "fast-check";

import { GITHUB_PULL_REQUEST_EVENT_NAMES } from "@/commands/journal/cli";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

/** A GitHub event name outside the pull-request set the journal CLI recognizes. */
export function arbitraryNonPullRequestEventName(): fc.Arbitrary<string> {
  const pullRequestEventNames: readonly string[] = Object.values(GITHUB_PULL_REQUEST_EVENT_NAMES);
  return arbitraryDomainLiteral().filter((eventName) => !pullRequestEventNames.includes(eventName));
}
