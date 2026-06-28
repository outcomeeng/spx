import { describe, expect, it } from "vitest";

import {
  DOMAIN_PATH_FILTER_DETAIL_PREFIX,
  DOMAIN_PATH_FILTER_LAYER,
  DOMAIN_PATH_FILTER_ROOT_PREFIX,
  domainPathFilterPredicate,
} from "@/lib/file-inclusion/predicates/domain-path-filter";
import {
  differentPrefixPath,
  distinctTrackedPaths,
  nestedTrackedPath,
  pathFilter,
  pathPrefix,
  PROPERTY_NUM_RUNS,
  trackedPath,
} from "@testing/harnesses/file-inclusion/path-predicates";

describe("domain-path-filter predicate — scenarios", () => {
  it("records exclude matches in the decision trail detail", () => {
    const excludedPath = trackedPath();
    const excludePrefix = pathPrefix(excludedPath);
    const result = domainPathFilterPredicate(excludedPath, pathFilter({ exclude: [excludePrefix] }));

    expect(result).toEqual({
      matched: true,
      layer: DOMAIN_PATH_FILTER_LAYER,
      detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.EXCLUDE}${excludePrefix}`,
    });
  });

  it("records include misses in the decision trail detail", () => {
    const includedPath = trackedPath();
    const includePrefix = pathPrefix(includedPath);
    const includeMissPath = differentPrefixPath(includedPath);
    const result = domainPathFilterPredicate(includeMissPath, pathFilter({ include: [includePrefix] }));

    expect(result).toEqual({
      matched: true,
      layer: DOMAIN_PATH_FILTER_LAYER,
      detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.INCLUDE}${includePrefix}`,
    });
  });

  it("records all configured include filters when no include prefix matches", () => {
    const [firstIncludedPath, secondIncludedPath] = distinctTrackedPaths(2);
    const includePrefixes = [pathPrefix(firstIncludedPath), pathPrefix(secondIncludedPath)];
    const outsidePath = pathOutsidePrefixes(includePrefixes);
    const result = domainPathFilterPredicate(outsidePath, pathFilter({ include: includePrefixes }));

    expect(result).toEqual({
      matched: true,
      layer: DOMAIN_PATH_FILTER_LAYER,
      detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.INCLUDE}${includePrefixes.join(",")}`,
    });
  });

  it("admits paths that match include filters and avoid exclude filters", () => {
    const includedPath = trackedPath();
    const includePrefix = pathPrefix(includedPath);
    const excludedPath = differentPrefixPath(includedPath);
    const result = domainPathFilterPredicate(
      includedPath,
      pathFilter({ include: [includePrefix], exclude: [excludedPath] }),
    );

    expect(result).toEqual({ matched: false, layer: DOMAIN_PATH_FILTER_LAYER });
  });

  it("matches nested include and exclude prefixes at path-segment boundaries", () => {
    const nestedPath = nestedTrackedPath();
    const nestedPrefix = pathPrefix(nestedPath);
    const includeResult = domainPathFilterPredicate(nestedPath, pathFilter({ include: [nestedPrefix] }));
    const excludeResult = domainPathFilterPredicate(nestedPath, pathFilter({ exclude: [nestedPrefix] }));

    expect(includeResult).toEqual({ matched: false, layer: DOMAIN_PATH_FILTER_LAYER });
    expect(excludeResult).toEqual({
      matched: true,
      layer: DOMAIN_PATH_FILTER_LAYER,
      detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.EXCLUDE}${nestedPrefix}`,
    });
  });

  it("normalizes separators, leading dot-slash, and trailing slashes in configured prefixes", () => {
    const nestedPath = nestedTrackedPath();
    const nestedPrefix = pathPrefix(nestedPath);
    const windowsPrefix = nestedPrefix.replaceAll("/", "\\");
    const dottedPrefix = `./${nestedPrefix}`;
    const trailingPrefix = `${nestedPrefix}//`;

    const windowsResult = domainPathFilterPredicate(nestedPath, pathFilter({ exclude: [windowsPrefix] }));
    const dottedResult = domainPathFilterPredicate(nestedPath, pathFilter({ include: [dottedPrefix] }));
    const trailingResult = domainPathFilterPredicate(nestedPath, pathFilter({ exclude: [trailingPrefix] }));

    expect(windowsResult).toEqual({
      matched: true,
      layer: DOMAIN_PATH_FILTER_LAYER,
      detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.EXCLUDE}${windowsPrefix}`,
    });
    expect(dottedResult).toEqual({ matched: false, layer: DOMAIN_PATH_FILTER_LAYER });
    expect(trailingResult).toEqual({
      matched: true,
      layer: DOMAIN_PATH_FILTER_LAYER,
      detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.EXCLUDE}${trailingPrefix}`,
    });
  });

  it("normalizes dot prefixes to the root path filter", () => {
    const tracked = trackedPath();
    const includeResult = domainPathFilterPredicate(
      tracked,
      pathFilter({ include: [DOMAIN_PATH_FILTER_ROOT_PREFIX] }),
    );
    const excludeResult = domainPathFilterPredicate(
      tracked,
      pathFilter({ exclude: [DOMAIN_PATH_FILTER_ROOT_PREFIX] }),
    );

    expect(includeResult).toEqual({ matched: false, layer: DOMAIN_PATH_FILTER_LAYER });
    expect(excludeResult).toEqual({
      matched: true,
      layer: DOMAIN_PATH_FILTER_LAYER,
      detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.EXCLUDE}${DOMAIN_PATH_FILTER_ROOT_PREFIX}`,
    });
  });
});

function pathOutsidePrefixes(prefixes: readonly string[]): string {
  for (let attempt = 0; attempt < PROPERTY_NUM_RUNS; attempt += 1) {
    const candidate = trackedPath();
    if (!prefixes.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`))) {
      return candidate;
    }
  }
  throw new Error("Unable to generate a path outside the configured include prefixes");
}
