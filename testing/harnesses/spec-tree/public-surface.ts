import { dirname, resolve } from "node:path";

import ts from "typescript";

import {
  findNextSpecTreeNode,
  projectSpecTree,
  readSpecTree,
  type SpecTreeProjection,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import type { RepresentativeSpecTreeFixture } from "@testing/generators/spec-tree/spec-tree";

const TYPESCRIPT_CONFIG_NAME = "tsconfig.json";
const PUBLIC_SPEC_TREE_CONSUMER_ENTRY = "testing/fixtures/spec-tree/public-surface-contract.ts";
const DIAGNOSTIC_HOST: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
};

export interface PublicSpecTreeSurfaceObservation {
  readonly diagnostics: readonly ts.Diagnostic[];
  readonly formattedDiagnostics: string;
}

export function observePublicSpecTreeSurfaceContract(sourceText: string): PublicSpecTreeSurfaceObservation {
  const configPath = resolve(process.cwd(), TYPESCRIPT_CONFIG_NAME);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, dirname(configPath), {}, configPath);
  const consumerPath = resolve(process.cwd(), PUBLIC_SPEC_TREE_CONSUMER_ENTRY);
  const host = ts.createCompilerHost(parsed.options);
  const readFile = host.readFile;
  const fileExists = host.fileExists;
  host.fileExists = (fileName) => fileName === consumerPath || fileExists(fileName);
  host.readFile = (fileName) => fileName === consumerPath ? sourceText : readFile(fileName);
  host.getSourceFile = (fileName, languageVersion) => {
    const content = host.readFile(fileName);
    return content === undefined ? undefined : ts.createSourceFile(fileName, content, languageVersion, true);
  };
  const program = ts.createProgram({
    rootNames: [consumerPath],
    options: parsed.options,
    host,
  });
  const diagnostics = [config.error, ...parsed.errors, ...ts.getPreEmitDiagnostics(program)].filter(
    (diagnostic): diagnostic is ts.Diagnostic => diagnostic !== undefined,
  );
  return {
    diagnostics,
    formattedDiagnostics: ts.formatDiagnosticsWithColorAndContext(diagnostics, DIAGNOSTIC_HOST),
  };
}

export interface RepresentativeSpecTreeSurfaceObservation {
  readonly fixture: RepresentativeSpecTreeFixture;
  readonly snapshot: SpecTreeSnapshot;
  readonly projection: SpecTreeProjection;
  readonly nextNodeId: string | null;
}

export async function observeRepresentativeSpecTreeSurfaceScenario(
  fixture: RepresentativeSpecTreeFixture,
): Promise<
  RepresentativeSpecTreeSurfaceObservation
> {
  const snapshot = await readSpecTree({
    source: {
      async *entries() {
        yield* fixture.entries;
      },
    },
  });
  const projection = projectSpecTree(snapshot);
  const nextNode = findNextSpecTreeNode(snapshot);

  return {
    fixture,
    snapshot,
    projection,
    nextNodeId: nextNode?.id ?? null,
  };
}
