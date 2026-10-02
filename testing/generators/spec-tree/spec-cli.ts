import { PACKAGE_MANIFEST } from "@/commands/release/package-manifest";
import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { DEFAULT_CONFIG_FILENAME } from "@/config";
import { SPEC_STATUS_OUTPUT_FORMATS } from "@/interfaces/cli/spec";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import { PYTHON_MARKER, TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import {
  SPEC_TREE_NODE_STATE,
  type SpecTreeNode,
  type SpecTreeNodeState,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import {
  type RepresentativeSpecTreeFixture,
  RETIRED_SPEC_APPLY_FIXTURE,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";

export type SpecCliContextTargetFixture = {
  readonly expectedTarget: string;
  readonly invocationTarget: string;
};

export type SpecCliApplyProtectionFixture = {
  readonly excludeContent: string;
  readonly protectedPaths: readonly string[];
  readonly pythonConfigContent: string;
};

export type SpecCliStatusRow = {
  readonly nodeId: string;
  readonly state: SpecTreeNodeState;
};

export type SpecCliUnsupportedStatusFormatFixture = {
  /** The source-owned values the diagnostic must name: the rejected token and the accepted formats. */
  readonly namedValues: readonly string[];
  readonly format: string;
};

/** The retired `show --content` request the spec names: the show command declares no such option. */
export const RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE = {
  option: "--content",
} as const;

/** One product configuration file a spec command handler must leave byte-identical. */
export type SpecCliProtectedConfigFile = {
  readonly path: string;
  readonly content: string;
};

/**
 * The product configuration files the spec domain's no-write rule names that
 * can coexist in one product — the materialized `spx.config` file plus the
 * package, Python, and TypeScript manifests — each beside generated content
 * the fixture's own identifiers make distinct.
 */
export function specCliProtectedConfigFiles(
  fixture: RepresentativeSpecTreeFixture,
): readonly SpecCliProtectedConfigFile[] {
  return [
    { path: PACKAGE_MANIFEST, content: `${JSON.stringify({ name: fixture.root.slug, private: true })}\n` },
    { path: PYTHON_MARKER, content: `[project]\nname = "${fixture.child.slug}"\n` },
    { path: TYPESCRIPT_MARKER, content: `${JSON.stringify({ extends: `./${fixture.peer.slug}.json` })}\n` },
  ];
}

/** The nested node's complete-component suffix — its own directory name — spelled with a trailing separator. */
export function specCliContextTargetFixture(
  snapshot: SpecTreeSnapshot,
  target: SpecTreeNode,
): SpecCliContextTargetFixture {
  const suffix = target.id.split(TRACKED_PATH_DIRECTORY_SEPARATOR).at(-1) ?? target.id;
  if (snapshot.allNodes.filter((node) => node.id.endsWith(suffix)).length !== 1) {
    throw new Error(`Expected exactly one node to end with ${suffix}`);
  }
  return {
    expectedTarget: [SPEC_TREE_CONFIG.ROOT_DIRECTORY, target.id].join(TRACKED_PATH_DIRECTORY_SEPARATOR),
    invocationTarget: `${suffix}${TRACKED_PATH_DIRECTORY_SEPARATOR}`,
  };
}

export function specCliApplyProtectionFixture(
  fixture: RepresentativeSpecTreeFixture,
): SpecCliApplyProtectionFixture {
  return {
    excludeContent: `${specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root)}\n`,
    protectedPaths: [
      DEFAULT_CONFIG_FILENAME,
      RETIRED_SPEC_APPLY_FIXTURE.excludeFile,
      RETIRED_SPEC_APPLY_FIXTURE.pythonConfigFile,
    ],
    pythonConfigContent: `[${RETIRED_SPEC_APPLY_FIXTURE.pytestSection}]\naddopts = ""\n`,
  };
}

export function specCliDeclaredStatusRows(
  fixture: RepresentativeSpecTreeFixture,
): readonly SpecCliStatusRow[] {
  const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.child);
  const peerDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.peer);
  return [
    {
      nodeId: rootDirectory,
      state: SPEC_TREE_NODE_STATE.DECLARED,
    },
    {
      nodeId: `${rootDirectory}/${childDirectory}`,
      state: SPEC_TREE_NODE_STATE.DECLARED,
    },
    {
      nodeId: peerDirectory,
      state: SPEC_TREE_NODE_STATE.DECLARED,
    },
  ];
}

export function specCliUnsupportedStatusFormatFixture(
  fixture: RepresentativeSpecTreeFixture,
): SpecCliUnsupportedStatusFormatFixture {
  const validFormats = new Set<string>(Object.values(OUTPUT_FORMAT));
  let candidate = `${fixture.root.slug}-${fixture.decision.slug}`;
  while (validFormats.has(candidate)) candidate = `${candidate}-${fixture.child.slug}`;
  return {
    namedValues: [candidate, ...SPEC_STATUS_OUTPUT_FORMATS],
    format: candidate,
  };
}
