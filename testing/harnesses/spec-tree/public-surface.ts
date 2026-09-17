import { dirname, resolve } from "node:path";

import ts from "typescript";

import {
  findNextSpecTreeNode,
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_NODE_STATE,
} from "@/lib/spec-tree";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";

const TYPESCRIPT_CONFIG_NAME = "tsconfig.json";
const PUBLIC_SPEC_TREE_CONSUMER_ENTRY = "testing/fixtures/spec-tree/public-surface-consumer.ts";
const DIAGNOSTIC_HOST: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
};

export interface PublicSpecTreeSurfaceObservation {
  readonly diagnostics: readonly ts.Diagnostic[];
  readonly formattedDiagnostics: string;
}

export function observePublicSpecTreeSurfaceExportsDeclaredContracts(): PublicSpecTreeSurfaceObservation {
  const configPath = resolve(process.cwd(), TYPESCRIPT_CONFIG_NAME);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, dirname(configPath), {}, configPath);
  const program = ts.createProgram({
    rootNames: [resolve(process.cwd(), PUBLIC_SPEC_TREE_CONSUMER_ENTRY)],
    options: parsed.options,
  });
  const diagnostics = [config.error, ...parsed.errors, ...ts.getPreEmitDiagnostics(program)].filter(
    (diagnostic): diagnostic is ts.Diagnostic => diagnostic !== undefined,
  );
  return {
    diagnostics,
    formattedDiagnostics: ts.formatDiagnosticsWithColorAndContext(diagnostics, DIAGNOSTIC_HOST),
  };
}

interface RepresentativeSpecTreeSurfaceValues {
  readonly productId: string | null;
  readonly rootIds: readonly string[];
  readonly allNodeIds: readonly string[];
  readonly rootOrder: number | null;
  readonly peerOrder: number | null;
  readonly rootPrecedesPeer: boolean;
  readonly rootState: string | null;
  readonly rootChildIds: readonly string[];
  readonly childState: string | null;
  readonly rootDecisionIds: readonly string[];
  readonly peerState: string | null;
  readonly projectionProductId: string | null;
  readonly projectionRootIds: readonly string[];
  readonly projectionDecisionIds: readonly string[];
  readonly nextNodeId: string | null;
}

export interface RepresentativeSpecTreeSurfaceObservation {
  readonly actual: RepresentativeSpecTreeSurfaceValues;
  readonly expected: RepresentativeSpecTreeSurfaceValues;
}

export async function observeRepresentativeSpecTreeSurfaceScenario(): Promise<
  RepresentativeSpecTreeSurfaceObservation
> {
  const fixture = buildRepresentativeFixture(KIND_REGISTRY);
  const snapshot = await readSpecTree({ source: createSource(fixture.entries) });
  const root = snapshot.allNodes.find((node) => node.id === fixture.root.id);
  const child = snapshot.allNodes.find((node) => node.id === fixture.child.id);
  const peer = snapshot.allNodes.find((node) => node.id === fixture.peer.id);
  const expectedRoots = [fixture.root, fixture.peer].sort((left, right) => left.order - right.order);

  const projection = projectSpecTree(snapshot);
  const nextNode = findNextSpecTreeNode(snapshot);

  return {
    actual: {
      productId: snapshot.product?.id ?? null,
      rootIds: snapshot.nodes.map((node) => node.id),
      allNodeIds: snapshot.allNodes.map((node) => node.id),
      rootOrder: root?.order ?? null,
      peerOrder: peer?.order ?? null,
      rootPrecedesPeer: root !== undefined && peer !== undefined && root.order < peer.order,
      rootState: root?.state ?? null,
      rootChildIds: root?.children.map((node) => node.id) ?? [],
      childState: child?.state ?? null,
      rootDecisionIds: root?.decisions.map((decision) => decision.id) ?? [],
      peerState: peer?.state ?? null,
      projectionProductId: projection.product?.id ?? null,
      projectionRootIds: projection.nodes.map((node) => node.id),
      projectionDecisionIds: projection.decisions.map((decision) => decision.id),
      nextNodeId: nextNode?.id ?? null,
    },
    expected: {
      productId: fixture.product.id,
      rootIds: expectedRoots.map((node) => node.id),
      allNodeIds: [fixture.root.id, fixture.child.id, fixture.peer.id],
      rootOrder: fixture.root.order,
      peerOrder: fixture.peer.order,
      rootPrecedesPeer: true,
      rootState: SPEC_TREE_NODE_STATE.DECLARED,
      rootChildIds: [fixture.child.id],
      childState: SPEC_TREE_NODE_STATE.PASSING,
      rootDecisionIds: [fixture.decision.id],
      peerState: SPEC_TREE_NODE_STATE.FAILING,
      projectionProductId: fixture.product.id,
      projectionRootIds: expectedRoots.map((node) => node.id),
      projectionDecisionIds: [fixture.decision.id],
      nextNodeId: fixture.root.id,
    },
  };
}
