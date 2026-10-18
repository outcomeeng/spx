import { CONFIG_FILE_DEFINITIONS, CONFIG_FILE_FORMAT } from "@/config/index";
import type { ReleaseData } from "@/domains/release/release-data";
import {
  arbitraryReleaseEndpointGrammarScenario,
  type ReleaseEndpointSource,
} from "@testing/generators/release/product-context";
import fc from "fast-check";

/** A release range of in-memory endpoints and the release data that names them. */
export interface ReleaseEndpointRange {
  readonly endpoints: readonly ReleaseEndpointSource[];
  readonly releaseData: ReleaseData;
}

/** A release range in which one endpoint commits an `spx/` tree and no methodology declaration. */
export interface ReleaseUndeclaredEndpointRange extends ReleaseEndpointRange {
  /** The ref of the endpoint whose committed declaration was removed. */
  readonly undeclaredRef: string;
}

/**
 * A release range whose endpoints each commit a methodology declaration (4.0 at the release ref,
 * 3.2 at the previous tag), beside the same range with the declaration of one endpoint removed
 * while its `spx/` tree stays committed. The removed endpoint is the release ref or the previous
 * tag, so the violation occurs under each grammar line.
 */
export interface ReleaseEndpointDeclarationScenario {
  readonly conforming: ReleaseEndpointRange;
  readonly undeclared: ReleaseUndeclaredEndpointRange;
}

export function arbitraryReleaseEndpointDeclarationScenario(): fc.Arbitrary<ReleaseEndpointDeclarationScenario> {
  return fc.record({
    grammar: arbitraryReleaseEndpointGrammarScenario(),
    undeclaredIndex: fc.nat({ max: 1 }),
  }).map(({ grammar, undeclaredIndex }) => {
    const declarationFilename = CONFIG_FILE_DEFINITIONS[CONFIG_FILE_FORMAT.JSON].filename;
    const undeclaredEndpoint = grammar.endpoints[undeclaredIndex];
    return {
      conforming: { endpoints: grammar.endpoints, releaseData: grammar.releaseData },
      undeclared: {
        endpoints: grammar.endpoints.map((endpoint) =>
          endpoint.ref === undeclaredEndpoint.ref
            ? { ref: endpoint.ref, files: endpoint.files.filter(({ path }) => path !== declarationFilename) }
            : endpoint
        ),
        releaseData: grammar.releaseData,
        undeclaredRef: undeclaredEndpoint.ref,
      },
    };
  });
}
