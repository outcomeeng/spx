import { createRequire } from "node:module";

import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { OUTPUT_FORMAT, SPEC_STATUS_MESSAGE } from "@/commands/spec/status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { KIND_REGISTRY, type NodeKind, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { CLI_PATH, PROJECT_ROOT, VERSION_FLAG } from "@testing/harnesses/constants";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("spx spec status", () => {
  it("reports current spec-tree nodes from a tracked spx directory", async () => {
    await withCurrentSpecTree(async ({ productDir, rootPath, childPath, nodeKind }) => {
      const { stdout, exitCode } = await runCli(productDir, "spec", "status");

      expect(exitCode).toBe(0);
      expect(stdout).toContain(KIND_REGISTRY[nodeKind].label);
      expect(stdout).toContain(rootPath);
      expect(stdout).toContain(childPath);
      expect(stdout).toContain(SPEC_TREE_NODE_STATE.DECLARED);
    });
  });

  it("reports empty output when no current spec-tree nodes exist", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const { stdout, exitCode } = await runCli(productDir, "spec", "status");

      expect(exitCode).toBe(0);
      expect(stdout).toBe(SPEC_STATUS_MESSAGE.EMPTY);
    });
  });

  it("serializes the current projection for JSON output", async () => {
    await withCurrentSpecTree(async ({ productDir, rootPath }) => {
      const { stdout, exitCode } = await runCli(productDir, "spec", "status", "--json");

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout) as { nodes: Array<{ id: string; state: string }> };
      expect(parsed.nodes[0]).toMatchObject({
        id: rootPath,
        state: SPEC_TREE_NODE_STATE.DECLARED,
      });
    });
  });

  it("accepts the explicit json format option", async () => {
    await withCurrentSpecTree(async ({ productDir }) => {
      const { stdout, exitCode } = await runCli(
        productDir,
        "spec",
        "status",
        "--format",
        OUTPUT_FORMAT.JSON,
      );

      expect(exitCode).toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });
  });

  it("renders markdown output for current spec-tree nodes", async () => {
    await withCurrentSpecTree(async ({ productDir, rootPath }) => {
      const { stdout, exitCode } = await runCli(
        productDir,
        "spec",
        "status",
        "--format",
        OUTPUT_FORMAT.MARKDOWN,
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`- `);
      expect(stdout).toContain(rootPath);
    });
  });

  it("renders table output for current spec-tree nodes", async () => {
    await withCurrentSpecTree(async ({ productDir, rootPath }) => {
      const { stdout, exitCode } = await runCli(
        productDir,
        "spec",
        "status",
        "--format",
        OUTPUT_FORMAT.TABLE,
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("| Kind | Path | State |");
      expect(stdout).toContain(rootPath);
    });
  });

  it("rejects an unknown output format", async () => {
    await withCurrentSpecTree(async ({ productDir }) => {
      const result = await runCli(productDir, "spec", "status", "--format", "invalid");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Invalid format");
    });
  });
});

describe("spx spec next", () => {
  it("reports the first non-passing current spec-tree node", async () => {
    await withCurrentSpecTree(async ({ productDir, rootPath, childPath }) => {
      const { stdout, exitCode } = await runCli(productDir, "spec", "next");

      expect(exitCode).toBe(0);
      expect(stdout).toContain(SPEC_NEXT_MESSAGE.HEADING);
      expect(stdout).toContain(rootPath);
      expect(stdout).not.toContain(childPath);
    });
  });

  it("reports empty output when no current spec-tree nodes exist", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const { stdout, exitCode } = await runCli(productDir, "spec", "next");

      expect(exitCode).toBe(0);
      expect(stdout).toBe(SPEC_NEXT_MESSAGE.EMPTY);
    });
  });
});

describe("spx help and errors", () => {
  it("rejects an unknown top-level command", async () => {
    const result = await execa("node", [CLI_PATH, "invalid"], { reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/unknown command|error/i);
  });

  it("prints help when invoked without a command", async () => {
    const result = await execa("node", [CLI_PATH], { reject: false });
    const output = result.stdout + result.stderr;

    expect(output).toMatch(/Usage:|Commands:/);
  });

  it("prints global help with the spec and session domains", async () => {
    const { stdout, exitCode } = await execa("node", [CLI_PATH, "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Usage:|Commands:/);
    expect(stdout).toContain("spec");
    expect(stdout).toContain("session");
  });

  it("prints status command help with output format flags", async () => {
    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--json");
    expect(stdout).toContain("--format");
  });

  it("prints next command help with current spec-tree wording", async () => {
    const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "next", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Find next spec-tree node");
  });

  it("prints the package version", async () => {
    const { version } = createRequire(import.meta.url)(`${PROJECT_ROOT}/package.json`) as {
      version: string;
    };

    const { stdout, exitCode } = await execa("node", [CLI_PATH, VERSION_FLAG]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(version);
  });
});

type CurrentSpecTreeFixture = {
  readonly productDir: string;
  readonly rootPath: string;
  readonly childPath: string;
  readonly nodeKind: NodeKind;
};

async function withCurrentSpecTree(
  callback: (fixture: CurrentSpecTreeFixture) => Promise<void>,
): Promise<void> {
  await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeNode }) => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const rootOrder = sampleSpecOrder();
    const childOrder = sampleSpecOrderAbove(rootOrder);
    const rootSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const childSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const rootPath = formatNodePath(rootOrder, rootSlug, nodeKind);
    const childPath = `${rootPath}/${formatNodePath(childOrder, childSlug, nodeKind)}`;

    await writeNode(
      `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${rootPath}/${rootSlug}.md`,
      formatSpecHeading(),
    );
    await writeNode(
      `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${childPath}/${childSlug}.md`,
      formatSpecHeading(),
    );

    await callback({ productDir, rootPath, childPath, nodeKind });
  });
}

async function runCli(
  cwd: string,
  ...args: readonly string[]
) {
  return execa("node", [CLI_PATH, ...args], { cwd, reject: false });
}

function sampleSpecOrder(): number {
  return sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.parentSourceOrder());
}

function sampleSpecOrderAbove(order: number): number {
  return sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.childSourceOrderAbove(order));
}

function formatNodePath(order: number, slug: string, kind: NodeKind): string {
  return `${order}-${slug}${KIND_REGISTRY[kind].suffix}`;
}

function formatSpecHeading(): string {
  return `# ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceTitle())}\n`;
}
