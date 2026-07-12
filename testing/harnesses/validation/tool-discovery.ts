import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { discoverTool, TOOL_DISCOVERY_PRIORITY, type ToolDiscoveryDeps } from "@/validation/discovery/tool-finder";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";

describe("ALWAYS: bundled validation tool discovery recognizes ESM-exported packages", () => {
  it("finds a bundled package through import resolution when package.json is not exported", async () => {
    const tool = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const productDir = process.cwd();
    const packageRoot = join(productDir, "node_modules", tool);
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

    const result = await discoverTool(tool, { productDir, deps });

    expect(result).toEqual({
      found: true,
      location: {
        tool,
        path: packageRoot,
        source: TOOL_DISCOVERY.SOURCES.BUNDLED,
      },
    });
  });

  it("returns the exact bundled executable path when supplied its package subpath", async () => {
    const tool = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const executableName = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const executableSpecifier = `${tool}/${executableName}`;
    const executablePath = join(process.cwd(), "node_modules", tool, executableName);
    const deps: ToolDiscoveryDeps = {
      resolveModule: (modulePath) => modulePath === executableSpecifier ? executablePath : null,
      resolveImport: () => null,
      existsSync: () => false,
      whichSync: () => null,
    };

    const result = await discoverTool(tool, {
      productDir: process.cwd(),
      executableName,
      bundledExecutable: executableSpecifier,
      deps,
    });

    expect(result).toEqual({
      found: true,
      location: {
        tool,
        path: executablePath,
        source: TOOL_DISCOVERY.SOURCES.BUNDLED,
      },
    });
  });

  it("prefers the product executable before the bundled fallback when requested", async () => {
    const tool = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const executableName = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const productDir = process.cwd();
    const productExecutable = join(productDir, "node_modules", ".bin", executableName);
    const bundledExecutable = `${tool}/${executableName}`;
    const deps: ToolDiscoveryDeps = {
      resolveModule: () => join(productDir, "node_modules", tool, executableName),
      resolveImport: () => null,
      existsSync: (filePath) => filePath === productExecutable,
      whichSync: () => null,
    };

    const result = await discoverTool(tool, {
      productDir,
      executableName,
      bundledExecutable,
      priority: TOOL_DISCOVERY_PRIORITY.PRODUCT_FIRST,
      deps,
    });

    expect(result).toEqual({
      found: true,
      location: {
        tool,
        path: productExecutable,
        source: TOOL_DISCOVERY.SOURCES.PROJECT,
      },
    });
  });

  it("preserves bundled-first discovery when no priority is requested", async () => {
    const tool = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const executableName = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const productDir = process.cwd();
    const productExecutable = join(productDir, "node_modules", ".bin", executableName);
    const bundledExecutable = `${tool}/${executableName}`;
    const bundledPath = join(productDir, "node_modules", tool, executableName);
    const deps: ToolDiscoveryDeps = {
      resolveModule: (specifier) => specifier === bundledExecutable ? bundledPath : null,
      resolveImport: () => null,
      existsSync: (filePath) => filePath === productExecutable,
      whichSync: () => null,
    };

    const result = await discoverTool(tool, {
      productDir,
      executableName,
      bundledExecutable,
      deps,
    });

    expect(result).toEqual({
      found: true,
      location: {
        tool,
        path: bundledPath,
        source: TOOL_DISCOVERY.SOURCES.BUNDLED,
      },
    });
  });
});
