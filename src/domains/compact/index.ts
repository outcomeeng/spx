/**
 * Compact domain — pure compaction-stash extraction, serialization, numbering,
 * and the session-domain import boundary.
 *
 * @module domains/compact
 */
export {
  COMPACT_FORBIDDEN_SESSION_IMPORTS,
  COMPACT_IMPORT_BOUNDARY_RULE_ID,
  type ForbiddenImport,
} from "./import-boundary";
export {
  COMPACT_STASH_FILE,
  COMPACT_TRANSCRIPT_MARKER,
  type CompactStashRecord,
  extractStashRecord,
  nextStashIndex,
  parseStashFilenameIndex,
  parseStashRecord,
  serializeStashRecord,
  stashRecordFilename,
} from "./stash";
