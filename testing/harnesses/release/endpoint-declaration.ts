import { documentationSyncCommand } from "@/commands/release/documentation-sync";
import { readReleaseProductContext, type ReleaseEndpointReader } from "@/commands/release/product-context";
import type { ReleaseEndpointRange } from "@testing/generators/release/endpoint-declaration";

const RELEASE_PRODUCT_DIRECTORY = "/release-product";

export interface ReleaseCommandObservation {
  readonly error: unknown;
  readonly producerInvocations: number;
  readonly auditorInvocations: number;
}

/**
 * Runs the documentation-sync release command over in-memory endpoints and reports the error it
 * raised and how many times the producer and the auditor agents ran. The observation carries no
 * verdict; the linked test decides what it means.
 */
export async function observeReleaseCommandOverEndpoints(
  range: ReleaseEndpointRange,
): Promise<ReleaseCommandObservation> {
  const endpointReader: ReleaseEndpointReader = {
    listPaths: async (_productDir, ref) => endpointFiles(range, ref).map(({ path }) => path),
    readText: async (_productDir, ref, path) =>
      endpointFiles(range, ref).find((file) => file.path === path)?.content ?? null,
  };
  let error: unknown;
  let producerInvocations = 0;
  let auditorInvocations = 0;
  try {
    await documentationSyncCommand({
      productDir: RELEASE_PRODUCT_DIRECTORY,
      agentRunner: {
        run: async () => {
          producerInvocations += 1;
        },
      },
      faithfulnessAuditor: async () => {
        auditorInvocations += 1;
      },
    }, {
      readProductContext: async (productDir, releaseData) =>
        await readReleaseProductContext(productDir, releaseData, { endpointReader }),
      resolveReleaseData: async () => range.releaseData,
      resolveDocumentationConfig: async () => ({}),
      stageDocumentation: async () => ({
        workingDirectory: RELEASE_PRODUCT_DIRECTORY,
        documents: [],
        cleanup: async () => undefined,
      }),
      readDocument: async () => {
        throw new Error("The release product context fails before documentation is read");
      },
      promoteDocumentation: async () => undefined,
    });
  } catch (caught) {
    error = caught;
  }
  return { error, producerInvocations, auditorInvocations };
}

function endpointFiles(range: ReleaseEndpointRange, ref: string): ReleaseEndpointRange["endpoints"][number]["files"] {
  const endpoint = range.endpoints.find((candidate) => candidate.ref === ref);
  if (endpoint === undefined) throw new Error(`Release endpoint source is absent for ${ref}`);
  return endpoint.files;
}
