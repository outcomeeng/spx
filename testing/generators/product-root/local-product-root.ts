import { CONFIG_FILENAMES } from "@/config/index";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { sampleGeneratedValue } from "@testing/generators/sample";

export const LOCAL_PRODUCT_ROOT_LAYOUT = {
  INVOCATION_DIR: "config at the invocation directory",
  INTERMEDIATE_ANCESTOR: "config at an intermediate ancestor",
  TOPLEVEL_ONLY: "config only at the git toplevel",
  NO_CONFIG: "config nowhere",
  OUTSIDE_GIT: "invocation directory outside git",
} as const;

export type LocalProductRootLayoutName = (typeof LOCAL_PRODUCT_ROOT_LAYOUT)[keyof typeof LOCAL_PRODUCT_ROOT_LAYOUT];

// The directories of a nested product layout, nearest to the invocation directory first.
export const LOCAL_PRODUCT_ROOT_DIRECTORY = {
  INVOCATION: "invocation",
  INTERMEDIATE_ANCESTOR: "intermediate-ancestor",
  TOPLEVEL: "toplevel",
} as const;

export type LocalProductRootDirectory =
  (typeof LOCAL_PRODUCT_ROOT_DIRECTORY)[keyof typeof LOCAL_PRODUCT_ROOT_DIRECTORY];

const DIRECTORIES_NEAREST_FIRST: readonly LocalProductRootDirectory[] = [
  LOCAL_PRODUCT_ROOT_DIRECTORY.INVOCATION,
  LOCAL_PRODUCT_ROOT_DIRECTORY.INTERMEDIATE_ANCESTOR,
  LOCAL_PRODUCT_ROOT_DIRECTORY.TOPLEVEL,
];

type LayoutPlacement = {
  readonly insideGit: boolean;
  readonly configPlacedAt: readonly LocalProductRootDirectory[];
};

const LAYOUT_PLACEMENTS: Readonly<Record<LocalProductRootLayoutName, LayoutPlacement>> = {
  [LOCAL_PRODUCT_ROOT_LAYOUT.INVOCATION_DIR]: { insideGit: true, configPlacedAt: DIRECTORIES_NEAREST_FIRST },
  [LOCAL_PRODUCT_ROOT_LAYOUT.INTERMEDIATE_ANCESTOR]: {
    insideGit: true,
    configPlacedAt: [LOCAL_PRODUCT_ROOT_DIRECTORY.INTERMEDIATE_ANCESTOR, LOCAL_PRODUCT_ROOT_DIRECTORY.TOPLEVEL],
  },
  [LOCAL_PRODUCT_ROOT_LAYOUT.TOPLEVEL_ONLY]: {
    insideGit: true,
    configPlacedAt: [LOCAL_PRODUCT_ROOT_DIRECTORY.TOPLEVEL],
  },
  [LOCAL_PRODUCT_ROOT_LAYOUT.NO_CONFIG]: { insideGit: true, configPlacedAt: [] },
  [LOCAL_PRODUCT_ROOT_LAYOUT.OUTSIDE_GIT]: { insideGit: false, configPlacedAt: [] },
};

export type LocalProductRootCase = {
  readonly layout: LocalProductRootLayoutName;
  readonly insideGit: boolean;
  readonly configFilename: string;
  readonly configPlacedAt: readonly LocalProductRootDirectory[];
  // The directory the layout's local product root is, derived from the placement by the nearest-config law.
  readonly expectedRoot: LocalProductRootDirectory;
  // Directory names descending from the git toplevel to the intermediate ancestor, then to the invocation directory.
  readonly productSegments: readonly [string, string];
  readonly invocationSegment: string;
};

// The local product root is the nearest directory from the invocation directory up to the git toplevel,
// itself included, holding a recognized config file, or the git toplevel when none does; outside git the
// invocation directory is the root.
function expectedRootFor(placement: LayoutPlacement): LocalProductRootDirectory {
  if (!placement.insideGit) return LOCAL_PRODUCT_ROOT_DIRECTORY.INVOCATION;
  return DIRECTORIES_NEAREST_FIRST.find((directory) => placement.configPlacedAt.includes(directory))
    ?? LOCAL_PRODUCT_ROOT_DIRECTORY.TOPLEVEL;
}

export function localProductRootCase(
  layout: LocalProductRootLayoutName,
  configFilename: string = Object.values(CONFIG_FILENAMES)[0],
): LocalProductRootCase {
  const placement = LAYOUT_PLACEMENTS[layout];
  const { productSegments, invocationSegment } = sampleGeneratedValue(CONFIG_TEST_GENERATOR.localProductRootLayout());
  return {
    layout,
    insideGit: placement.insideGit,
    configFilename,
    configPlacedAt: placement.configPlacedAt,
    expectedRoot: expectedRootFor(placement),
    productSegments,
    invocationSegment,
  };
}

// Every layout crossed with every recognized config filename: the complete finite domain.
export function localProductRootCases(): readonly LocalProductRootCase[] {
  return Object.values(LOCAL_PRODUCT_ROOT_LAYOUT).flatMap((layout) =>
    Object.values(CONFIG_FILENAMES).map((configFilename) => localProductRootCase(layout, configFilename))
  );
}
