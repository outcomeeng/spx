import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { DEFAULT_CONFIG_FILENAME } from "@/config";
import { SPEC_STATUS_FORMAT_MESSAGE, SPEC_STATUS_OUTPUT_FORMATS } from "@/interfaces/cli/spec";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
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
  readonly output: string;
  readonly state: SpecTreeNodeState;
};

export type SpecCliUnsupportedStatusFormatFixture = {
  readonly expectedDiagnostic: string;
  readonly format: string;
};

/** The retired `show --content` request: Commander rejects the option before the show handler runs. */
export const RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE = {
  option: "--content",
  // Commander emits this prefix for unknown options before domain action handlers run.
  unknownOptionPrefix: "error: unknown option",
} as const;

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
      output: `${KIND_REGISTRY[fixture.root.kind].label} ${rootDirectory} [${SPEC_TREE_NODE_STATE.DECLARED}]`,
      state: SPEC_TREE_NODE_STATE.DECLARED,
    },
    {
      nodeId: `${rootDirectory}/${childDirectory}`,
      output: `  ${
        KIND_REGISTRY[fixture.child.kind].label
      } ${rootDirectory}/${childDirectory} [${SPEC_TREE_NODE_STATE.DECLARED}]`,
      state: SPEC_TREE_NODE_STATE.DECLARED,
    },
    {
      nodeId: peerDirectory,
      output: `${KIND_REGISTRY[fixture.peer.kind].label} ${peerDirectory} [${SPEC_TREE_NODE_STATE.DECLARED}]`,
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
    expectedDiagnostic:
      `${SPEC_STATUS_FORMAT_MESSAGE.ERROR_PREFIX}: ${SPEC_STATUS_FORMAT_MESSAGE.INVALID_PREFIX} "${candidate}". ${SPEC_STATUS_FORMAT_MESSAGE.VALID_OPTIONS_PREFIX}: ${
        SPEC_STATUS_OUTPUT_FORMATS.join(", ")
      }`,
    format: candidate,
  };
}
