import * as fc from "fast-check";

import {
  CONFIG_TEST_GENERATOR,
  type GeneratedResolutionScope,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";

const PRODUCT_CONTEXT_MAPPING_CASE_COUNT = 2;

export interface ProductContextPathCase extends GeneratedResolutionScope {
  readonly name: string;
}

/** Multiple generated path shapes for every product-context correspondence. */
export function productContextPathCases(): readonly ProductContextPathCase[] {
  return sampleConfigTestValue(
    fc.uniqueArray(CONFIG_TEST_GENERATOR.resolutionScope(), {
      minLength: PRODUCT_CONTEXT_MAPPING_CASE_COUNT,
      maxLength: PRODUCT_CONTEXT_MAPPING_CASE_COUNT,
      selector: (scope) => `${scope.productDirectory}/${scope.nestedDirectory}`,
    }),
  ).map((scope) => ({ ...scope, name: `${scope.productDirectory}/${scope.nestedDirectory}` }));
}
