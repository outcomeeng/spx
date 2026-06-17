import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { discoverTool, type ToolDiscoveryDeps } from "@/validation/discovery/tool-finder";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";

describe("ALWAYS: bundled validation tool discovery recognizes ESM-exported packages", () => {
  it("finds a bundled package through import resolution when package.json is not exported", async () => {
    const tool = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const projectRoot = process.cwd();
    const packageRoot = join(projectRoot, "node_modules", tool);
    const bundledEntryPath = join(
      packageRoot,
      sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()),
    );
    const bundledPackageJsonPath = join(packageRoot, "package.json");
    const deps: ToolDiscoveryDeps = {
      resolveModule: () => null,
      resolveImport: (modulePath) => modulePath === tool ? pathToFileURL(bundledEntryPath).href : null,
      existsSync: (filePath) => filePath === bundledPackageJsonPath,
      whichSync: () => null,
    };

    const result = await discoverTool(tool, { projectRoot, deps });

    expect(result).toEqual({
      found: true,
      location: {
        tool,
        path: packageRoot,
        source: TOOL_DISCOVERY.SOURCES.BUNDLED,
      },
    });
  });
});
