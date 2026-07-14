import { parseScopePattern, subsumes } from "@/domains/claude/settings/subsumption";
import {
  assertEmbeddedPathTokenRemainsCommand,
  assertSharedCommandPrefixDoesNotSubsume,
  assertSubsumptionIsTransitive,
} from "@testing/harnesses/claude/permissions/subsumption";
import { describe, test } from "vitest";

describe("permission subsumption properties", () => {
  test("nested scope subsumption is transitive", () => {
    assertSubsumptionIsTransitive(subsumes);
  });

  test("an embedded path token remains a command scope", () => {
    assertEmbeddedPathTokenRemainsCommand(parseScopePattern);
  });

  test("commands sharing a textual prefix remain distinct", () => {
    assertSharedCommandPrefixDoesNotSubsume(subsumes);
  });
});
