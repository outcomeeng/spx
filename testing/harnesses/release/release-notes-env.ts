import { canonicalizeExistingPath, createReleaseNotesFilesystem } from "@/commands/release";
import {
  type ArtifactPromoter,
  type ArtifactReader,
  type ArtifactStager,
  type PathCanonicalizer,
  type PathFileDetector,
  type PathSymlinkDetector,
  ReleaseNotesError,
} from "@/domains/release/release-notes";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_DIR_PREFIX = "spx-release-notes-";
export const RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE = "dir";
export const RELEASE_NOTES_FILE_SYMLINK_TYPE = "file";
export const RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX = "spx-release-notes-outside-";

interface ReleaseNotesEnvOptions {
  readonly beforeArtifactRead?: (path: string) => Promise<void>;
  readonly beforeDirectoryCreate?: (path: string) => Promise<void>;
  readonly beforeArtifactPromotionOpen?: (path: string) => Promise<void>;
  readonly beforeArtifactPromotion?: (path: string) => Promise<void>;
  readonly beforeFinalArtifactWrite?: (path: string) => Promise<void>;
  readonly beforeStageArtifactRead?: (path: string) => Promise<void>;
}

/** A real temp working tree plus the production filesystem reader for release-notes composition tests. */
export interface ReleaseNotesEnv {
  /** The product working tree the changelog is resolved and written within. */
  readonly workingDirectory: string;
  /** The injected read-back dependency: a real filesystem reader over the working tree. */
  readonly readArtifact: ArtifactReader;
  /** The injected staging dependency: a real temp path the agent writes before promotion. */
  readonly createArtifactStage: ArtifactStager;
  /** The injected promotion dependency: a real filesystem final-path writer. */
  readonly promoteArtifact: ArtifactPromoter;
  /** The injected canonicalizer: a real filesystem `realpath` boundary over the temp tree. */
  readonly canonicalizePath: PathCanonicalizer;
  /** The injected symlink detector: a real filesystem `lstat` boundary over the temp tree. */
  readonly isSymbolicLink: PathSymlinkDetector;
  /** The injected file detector: a real filesystem `lstat` boundary over the temp tree. */
  readonly isFile: PathFileDetector;
}

/**
 * Provisions a real temp working tree and real filesystem staging, promotion, and
 * artifact-reader boundaries, runs the callback against them, and removes the
 * directory afterward. The read-back is exercised against real files the agent
 * double wrote and the promoter wrote.
 */
export async function withReleaseNotesEnv(
  callback: (env: ReleaseNotesEnv) => Promise<void>,
  options: ReleaseNotesEnvOptions = {},
): Promise<void> {
  await withTempDir(TEMP_DIR_PREFIX, async (workingDirectory) => {
    const canonicalWorkingDirectory = await canonicalizeExistingPath(workingDirectory);
    if (canonicalWorkingDirectory === undefined) {
      throw new ReleaseNotesError(
        `Release-notes working directory cannot be canonicalized: ${workingDirectory}`,
      );
    }
    const filesystem = createReleaseNotesFilesystem({
      beforeArtifactRead: options.beforeArtifactRead,
      beforeDirectoryCreate: options.beforeDirectoryCreate,
      beforeArtifactPromotionOpen: options.beforeArtifactPromotionOpen,
      beforeArtifactPromotion: options.beforeArtifactPromotion,
      beforeFinalArtifactWrite: options.beforeFinalArtifactWrite,
      beforeStageArtifactRead: options.beforeStageArtifactRead,
    });
    await callback({
      workingDirectory: canonicalWorkingDirectory,
      readArtifact: filesystem.readArtifact,
      createArtifactStage: filesystem.createArtifactStage,
      promoteArtifact: filesystem.promoteArtifact,
      canonicalizePath: filesystem.canonicalizePath,
      isSymbolicLink: filesystem.isSymbolicLink,
      isFile: filesystem.isFile,
    });
  });
}
