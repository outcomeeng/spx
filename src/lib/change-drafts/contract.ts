import { randomFillSync } from "node:crypto";
import * as fs from "node:fs/promises";
import { z } from "zod";

import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import { EXCLUSIVE_CREATE_FLAG } from "@/lib/state-store";

export const CHANGE_DRAFT = {
  extension: ".md",
  directoryMode: 0o700,
  fileMode: 0o600,
  permissionMask: 0o777,
  kindPattern: /^[a-z][\da-z-]*$/u,
  idPattern: /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u,
} as const;

/** The pre-shared per-worktree location that no draft operation reads, moves, or deletes. */
export const RETIRED_CHANGE_DRAFT_DIRECTORY = "change-drafts";

export const CHANGE_DRAFT_ERROR = {
  invalidKind: "invalid-kind",
  invalidId: "invalid-id",
  unsafeStorage: "unsafe-storage",
  visibleToGit: "visible-to-git",
  operationFailed: "operation-failed",
} as const;

export const CHANGE_DRAFT_OPERATION = { create: "create", list: "list", delete: "delete" } as const;

export type ChangeDraftErrorCode = (typeof CHANGE_DRAFT_ERROR)[keyof typeof CHANGE_DRAFT_ERROR];

export class ChangeDraftError extends Error {
  constructor(
    readonly code: ChangeDraftErrorCode,
    readonly operation: string,
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`Draft ${operation} failed at ${path}: ${code}`, options);
    this.name = "ChangeDraftError";
  }
}

export const changeDraftDescriptorSchema = z.object({
  kind: z.string().regex(CHANGE_DRAFT.kindPattern),
  draftId: z.string().regex(CHANGE_DRAFT.idPattern),
  path: z.string(),
});

export type ChangeDraftDescriptor = z.infer<typeof changeDraftDescriptorSchema>;

export const changeDraftDeletionSchema = z.object({
  kind: changeDraftDescriptorSchema.shape.kind,
  draftId: changeDraftDescriptorSchema.shape.draftId,
  removed: z.boolean(),
});

export type ChangeDraftDeletion = z.infer<typeof changeDraftDeletionSchema>;

export interface ChangeDraftStats {
  readonly mode: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface ChangeDraftFile {
  close(): Promise<void>;
}

export interface ChangeDraftFileSystem {
  inspect(path: string): Promise<ChangeDraftStats>;
  makeDirectory(path: string, mode: number): Promise<void>;
  list(path: string): Promise<string[]>;
  openExclusive(path: string, mode: number): Promise<ChangeDraftFile>;
  remove(path: string): Promise<void>;
}

export interface ChangeDraftDependencies {
  readonly fs: ChangeDraftFileSystem;
  readonly git: GitDependencies;
  readonly generateId: () => string;
}

export interface ChangeDraftStore {
  create(kind: string): Promise<ChangeDraftDescriptor>;
  list(kind?: string): Promise<readonly ChangeDraftDescriptor[]>;
  delete(kind: string, draftId: string): Promise<ChangeDraftDeletion>;
}

export interface ChangeDraftStoreOptions {
  readonly cwd: string;
  readonly dependencies?: ChangeDraftDependencies;
}

const UUID_V7 = {
  timestampBytes: 6,
  totalBytes: 16,
  versionByte: 6,
  versionBits: 0x70,
  variantByte: 8,
  variantBits: 0x80,
  lowNibbleMask: 0x0f,
  lowSixBitsMask: 0x3f,
  bitsPerByte: 8,
  hexRadix: 16,
  groupEnds: [4, 6, 8, 10],
} as const;

/** A stateless UUIDv7: the current millisecond in its first 48 bits, random bits after the version and variant. */
export function generateUuidV7(now: () => number = Date.now): string {
  const bytes = randomFillSync(new Uint8Array(UUID_V7.totalBytes));
  let timestamp = BigInt(now());
  for (let index = UUID_V7.timestampBytes - 1; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= BigInt(UUID_V7.bitsPerByte);
  }
  bytes[UUID_V7.versionByte] = UUID_V7.versionBits | (bytes[UUID_V7.versionByte] & UUID_V7.lowNibbleMask);
  bytes[UUID_V7.variantByte] = UUID_V7.variantBits | (bytes[UUID_V7.variantByte] & UUID_V7.lowSixBitsMask);
  const hex = Array.from(bytes, (byte) => byte.toString(UUID_V7.hexRadix).padStart(2, "0"));
  const groups: string[] = [];
  let start = 0;
  for (const end of [...UUID_V7.groupEnds, UUID_V7.totalBytes]) {
    groups.push(hex.slice(start, end).join(""));
    start = end;
  }
  return groups.join("-");
}

export const changeDraftDependencies: ChangeDraftDependencies = {
  fs: {
    inspect: (path) => fs.lstat(path),
    makeDirectory: async (path, mode) => {
      await fs.mkdir(path, { mode });
    },
    list: (path) => fs.readdir(path),
    openExclusive: async (path, mode) => {
      const handle = await fs.open(path, EXCLUSIVE_CREATE_FLAG, mode);
      return { close: () => handle.close() };
    },
    remove: (path) => fs.unlink(path),
  },
  git: defaultGitDependencies,
  generateId: () => generateUuidV7(),
};
