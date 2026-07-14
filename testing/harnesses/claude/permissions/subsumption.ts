import assert from "node:assert/strict";

import { type Permission, SCOPE_PATTERN_TYPE, type ScopePattern } from "@/domains/claude/settings/types";
import {
  arbitraryEmbeddedPathTokenCommand,
  arbitrarySharedCommandPrefix,
  arbitrarySubsumptionChain,
} from "@testing/generators/claude/permissions/scenarios";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

export type Subsumes = (broader: Permission, narrower: Permission) => boolean;
export type ParseScopePattern = (scope: string) => ScopePattern;

export function assertSubsumptionIsTransitive(subsumes: Subsumes): void {
  assertProperty(
    arbitrarySubsumptionChain(),
    (scenario) => {
      assert.equal(subsumes(scenario.broader, scenario.middle), true);
      assert.equal(subsumes(scenario.middle, scenario.narrower), true);
      assert.equal(subsumes(scenario.broader, scenario.narrower), true);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertEmbeddedPathTokenRemainsCommand(
  parseScopePattern: ParseScopePattern,
): void {
  assertProperty(
    arbitraryEmbeddedPathTokenCommand(),
    (scenario) => {
      assert.equal(parseScopePattern(scenario.scope).type, SCOPE_PATTERN_TYPE.COMMAND);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertSharedCommandPrefixDoesNotSubsume(
  subsumes: Subsumes,
): void {
  assertProperty(
    arbitrarySharedCommandPrefix(),
    (scenario) => {
      assert.equal(subsumes(scenario.broader, scenario.distinct), false);
      assert.equal(subsumes(scenario.distinct, scenario.broader), false);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}
