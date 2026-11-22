import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  AGENT_NAME_EXEMPT_PLACEMENTS,
  AGENT_NAME_LITERAL_CONTEXTS,
  AGENT_NAMES,
  arbitraryExemptAgentNameFixture,
  arbitraryViolatingAgentNameFixture,
} from "@testing/generators/agent-environment/agent-names";
import {
  AGENT_NAMES_TRANSITIONAL_ALLOWLIST,
  findAgentNameLiterals,
  readRepositorySourceFiles,
} from "@testing/harnesses/agent-environment/agent-names";

describe("agent-names-in-registry-only", () => {
  it("finds no agent id or declared variable name as a literal in a source file the rule judges", () => {
    expect(findAgentNameLiterals(readRepositorySourceFiles(), AGENT_NAMES)).toEqual([]);
  });

  it("names only files that exist in the transitional allowlist", () => {
    const sourcePaths = new Set(readRepositorySourceFiles().map((file) => file.path));

    expect(AGENT_NAMES_TRANSITIONAL_ALLOWLIST.filter((path) => !sourcePaths.has(path))).toEqual([]);
  });

  it.each(AGENT_NAME_LITERAL_CONTEXTS)("rejects a source file that holds a name as a literal: %s", (context) => {
    fc.assert(
      fc.property(arbitraryViolatingAgentNameFixture(context), (fixture) => {
        const found = findAgentNameLiterals([fixture.file], AGENT_NAMES);

        expect(found.map(({ path, literal }) => ({ path, literal }))).toEqual([
          { path: fixture.file.path, literal: fixture.name },
        ]);
      }),
    );
  });

  it.each(AGENT_NAME_EXEMPT_PLACEMENTS)("leaves a name the rule does not judge: %s", (placement) => {
    fc.assert(
      fc.property(arbitraryExemptAgentNameFixture(placement), (fixture) => {
        expect(findAgentNameLiterals([fixture.file], AGENT_NAMES)).toEqual([]);
      }),
    );
  });
});
