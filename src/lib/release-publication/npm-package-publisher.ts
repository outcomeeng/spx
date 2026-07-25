import {
  PACKAGE_PROVENANCE,
  type PackagePublication,
  type PackagePublisher,
  ReleasePublicationError,
} from "@/domains/release/publication";

import { type ReleasePublicationRunner, runReleasePublicationCommand } from "./runner";

const NPM_PUBLICATION = {
  EXECUTABLE: "npm",
  VIEW: "view",
  JSON: "--json",
  PUBLISH: "publish",
  PROVENANCE: "--provenance",
  ACCESS: "--access",
  PUBLIC: "public",
  IGNORE_SCRIPTS: "--ignore-scripts",
  NOT_FOUND: "E404",
  SLSA_PROVENANCE_V1: "https://slsa.dev/provenance/v1",
} as const;

export interface NpmPackagePublisherOptions {
  readonly productDir: string;
  readonly run?: ReleasePublicationRunner;
}

export function createNpmPackagePublisher(
  options: NpmPackagePublisherOptions,
): PackagePublisher {
  const run = options.run ?? runReleasePublicationCommand;
  return {
    inspect: async (publication) => {
      const result = await run(
        NPM_PUBLICATION.EXECUTABLE,
        [
          NPM_PUBLICATION.VIEW,
          `${publication.name}@${publication.version}`,
          NPM_PUBLICATION.JSON,
        ],
        { cwd: options.productDir },
      );
      if (result.exitCode !== 0) {
        if (result.stderr.includes(NPM_PUBLICATION.NOT_FOUND)) {
          return null;
        }
        throw new ReleasePublicationError(`npm view failed: ${result.stderr.trim()}`);
      }
      return parsePackagePublication(result.stdout);
    },
    publish: async () => {
      const result = await run(
        NPM_PUBLICATION.EXECUTABLE,
        [
          NPM_PUBLICATION.PUBLISH,
          NPM_PUBLICATION.PROVENANCE,
          NPM_PUBLICATION.ACCESS,
          NPM_PUBLICATION.PUBLIC,
          NPM_PUBLICATION.IGNORE_SCRIPTS,
        ],
        { cwd: options.productDir },
      );
      if (result.exitCode !== 0) {
        throw new ReleasePublicationError(`npm publish failed: ${result.stderr.trim()}`);
      }
    },
  };
}

function parsePackagePublication(raw: string): PackagePublication {
  const metadata = JSON.parse(raw) as unknown;
  if (!isRecord(metadata)) {
    throw new ReleasePublicationError("npm view returned invalid package metadata");
  }
  const name = metadata.name;
  const version = metadata.version;
  const commit = metadata.gitHead;
  if (typeof name !== "string" || typeof version !== "string" || typeof commit !== "string") {
    throw new ReleasePublicationError("npm view package metadata lacks name, version, or gitHead");
  }
  return {
    name,
    version,
    commit,
    provenance: provenancePredicate(metadata) === NPM_PUBLICATION.SLSA_PROVENANCE_V1
      ? PACKAGE_PROVENANCE.VERIFIED
      : PACKAGE_PROVENANCE.UNVERIFIED,
  };
}

function provenancePredicate(metadata: Record<string, unknown>): unknown {
  const dist = metadata.dist;
  if (!isRecord(dist)) return undefined;
  const attestations = dist.attestations;
  if (!isRecord(attestations)) return undefined;
  const provenance = attestations.provenance;
  return isRecord(provenance) ? provenance.predicateType : undefined;
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null;
}
