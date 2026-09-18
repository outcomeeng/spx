import {
  DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
  documentationSyncCommand,
} from "@/commands/release/documentation-sync";
import { readReleaseProductContext, type ReleaseEndpointReader } from "@/commands/release/product-context";
import type { ReleaseProductContext } from "@/domains/release/product-context";
import {
  RELEASE_ENDPOINT_OWNERSHIP_CASE,
  type ReleaseEndpointSource,
  type ReleaseEndpointSourceScenario,
} from "@testing/generators/release/product-context";

const IN_MEMORY_PRODUCT_DIRECTORY = "/release-product";

export interface ReleaseEndpointSourceObservation {
  readonly context: ReleaseProductContext;
  readonly error: unknown;
  readonly producerInvocations: number;
  readonly auditorInvocations: number;
}

export async function observeReleaseEndpointSources(
  scenario: ReleaseEndpointSourceScenario,
): Promise<ReleaseEndpointSourceObservation> {
  const endpointReader = createInMemoryReleaseEndpointReader(scenario.endpoints);
  let context: ReleaseProductContext = [];
  let error: unknown;
  let producerInvocations = 0;
  let auditorInvocations = 0;
  try {
    if (scenario.kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED) {
      await documentationSyncCommand({
        productDir: IN_MEMORY_PRODUCT_DIRECTORY,
        agentRunner: {
          run: async () => {
            producerInvocations += 1;
          },
        },
        faithfulnessAuditor: async () => {
          auditorInvocations += 1;
        },
      }, {
        ...DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
        readProductContext: async (productDir, releaseData) =>
          await readReleaseProductContext(productDir, releaseData, { endpointReader }),
        resolveReleaseData: async () => scenario.releaseData,
        resolveDocumentationConfig: async () => ({}),
      });
    } else {
      context = await readReleaseProductContext(
        IN_MEMORY_PRODUCT_DIRECTORY,
        scenario.releaseData,
        { endpointReader },
      );
    }
  } catch (caught) {
    error = caught;
  }
  return { context, error, producerInvocations, auditorInvocations };
}

function createInMemoryReleaseEndpointReader(
  endpointSources: readonly ReleaseEndpointSource[],
): ReleaseEndpointReader {
  const sourcesByRef = new Map(endpointSources.map((source) => [source.ref, source]));
  return {
    listPaths: async (_productDir, ref) => endpointSource(sourcesByRef, ref).files.map(({ path }) => path),
    readText: async (_productDir, ref, path) =>
      endpointSource(sourcesByRef, ref).files.find((file) => file.path === path)?.content ?? null,
  };
}

function endpointSource(
  sourcesByRef: ReadonlyMap<string, ReleaseEndpointSource>,
  ref: string,
): ReleaseEndpointSource {
  const source = sourcesByRef.get(ref);
  if (source === undefined) throw new Error(`Release endpoint source is absent for ${ref}`);
  return source;
}
