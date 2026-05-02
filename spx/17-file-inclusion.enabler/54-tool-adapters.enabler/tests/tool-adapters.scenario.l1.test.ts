import { describe, expect, it } from "vitest";

import { REGISTERED_TOOL_NAMES, toToolArguments } from "@/lib/file-inclusion/adapters";

import { makeScope, makeToolAdaptersConfig, testAdapterFlag } from "./support";

const testTool = REGISTERED_TOOL_NAMES[0];
if (!testTool) throw new Error("adapters.scenario: no registered tools");
const excludedPaths = ["src/alpha.ts", "src/beta.ts"];

describe("tool adapters — scenarios", () => {
  it("returned arguments reference each excluded path in the tool's native ignore-flag form", () => {
    const scope = makeScope(excludedPaths);
    const config = makeToolAdaptersConfig({ [testTool]: testAdapterFlag });

    const result = toToolArguments(scope, testTool, config);

    expect(result.length).toBe(excludedPaths.length * 2);
    for (const path of excludedPaths) {
      const idx = result.indexOf(path);
      expect(idx, `adapters.scenario: "${path}" absent from result`).toBeGreaterThanOrEqual(0);
      expect(result[idx - 1], `adapters.scenario: flag absent before "${path}"`).toBe(testAdapterFlag);
    }
  });

  it("throws an error naming the unregistered tool and the registered tool set when tool is not registered", () => {
    const unknownTool = "unknown-tool-xyz";
    const scope = makeScope(["src/foo.ts"]);
    const config = makeToolAdaptersConfig(
      Object.fromEntries(REGISTERED_TOOL_NAMES.map((n) => [n, testAdapterFlag])),
    );

    let caughtError: Error | undefined;
    try {
      toToolArguments(scope, unknownTool, config);
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError, "adapters.scenario: toToolArguments should throw").toBeInstanceOf(Error);
    expect(caughtError!.message).toContain(unknownTool);
    for (const registeredName of REGISTERED_TOOL_NAMES) {
      expect(caughtError!.message, `adapters.scenario: "${registeredName}" absent from error.message`).toContain(
        registeredName,
      );
    }
  });
});
