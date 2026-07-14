import { dirname, resolve } from "node:path";

import ts from "typescript";
import { expect } from "vitest";

import {
  findNextSpecTreeNode,
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_NODE_STATE,
} from "@/lib/spec-tree";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

const TYPESCRIPT_CONFIG_NAME = "tsconfig.json";
const PUBLIC_SURFACE_CONSUMER_FIXTURE = "testing/fixtures/spec-tree/public-surface-consumer.ts";

const DIAGNOSTIC_HOST: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
};

export function assertPublicSpecTreeSurfaceExportsDeclaredContracts(): void {
  const configPath = resolve(process.cwd(), TYPESCRIPT_CONFIG_NAME);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(config.error, formatDiagnostic(config.error)).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath), {}, configPath);
  const program = ts.createProgram({
    rootNames: [resolve(process.cwd(), PUBLIC_SURFACE_CONSUMER_FIXTURE)],
    options: parsed.options,
  });
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  expect(diagnostics, ts.formatDiagnosticsWithColorAndContext(diagnostics, DIAGNOSTIC_HOST)).toEqual([]);
}

export async function assertRepresentativeSpecTreeSurfaceScenario(): Promise<void> {
  const fixture = buildRepresentativeFixture(KIND_REGISTRY);
  const snapshot = await readSpecTree({ source: createSource(fixture.entries) });
  const root = expectPresent(snapshot.allNodes.find((node) => node.id === fixture.root.id));
  const child = expectPresent(snapshot.allNodes.find((node) => node.id === fixture.child.id));
  const peer = expectPresent(snapshot.allNodes.find((node) => node.id === fixture.peer.id));
  const expectedRoots = [fixture.root, fixture.peer].sort((left, right) => left.order - right.order);
  const snapshotProduct = expectPresent(snapshot.product);

  expect(snapshotProduct.id).toBe(fixture.product.id);
  expect(snapshot.nodes.map((node) => node.id)).toEqual(expectedRoots.map((node) => node.id));
  expect(snapshot.allNodes.map((node) => node.id)).toEqual([
    fixture.root.id,
    fixture.child.id,
    fixture.peer.id,
  ]);
  expect(root.order).toBe(fixture.root.order);
  expect(peer.order).toBe(fixture.peer.order);
  expect(root.order).toBeLessThan(peer.order);
  expect(root.state).toBe(SPEC_TREE_NODE_STATE.DECLARED);
  expect(root.children.map((node) => node.id)).toEqual([fixture.child.id]);
  expect(child.state).toBe(SPEC_TREE_NODE_STATE.PASSING);
  expect(root.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
  expect(peer.state).toBe(SPEC_TREE_NODE_STATE.FAILING);

  const projection = projectSpecTree(snapshot);
  const projectionProduct = expectPresent(projection.product);
  const nextNode = expectPresent(findNextSpecTreeNode(snapshot));

  expect(projectionProduct.id).toBe(fixture.product.id);
  expect(projection.nodes.map((node) => node.id)).toEqual(expectedRoots.map((node) => node.id));
  expect(projection.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
  expect(nextNode.id).toBe(fixture.root.id);
}

function formatDiagnostic(diagnostic: ts.Diagnostic | undefined): string {
  return diagnostic === undefined ? "" : ts.formatDiagnostic(diagnostic, DIAGNOSTIC_HOST);
}
