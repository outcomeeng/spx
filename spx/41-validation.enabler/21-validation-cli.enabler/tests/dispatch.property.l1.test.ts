import { describe, it } from "vitest";

import { assertUnknownSubcommandProperty } from "@testing/harnesses/validation/cli";

describe("spx validation dispatch - invariant over non-matching argument strings", () => {
  it("every unknown subcommand string reaches the unknown-subcommand diagnostic path", assertUnknownSubcommandProperty);
});
