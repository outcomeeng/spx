import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { z } from "zod";

import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import { EXCLUSIVE_CREATE_FLAG } from "@/lib/state-store";

export const CHANGE_DRAFT = {
  directory: "change-drafts",
  extension: ".md",
  directoryMode: 0o700,
  fileMode: 0o600,
  permissionMask: 0o777,
  idPattern: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u,
} as const;

export const CHANGE_DRAFT_ERROR = {
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
    super(`Change draft ${operation} failed at ${path}: ${code}`, options);
    this.name = "ChangeDraftError";
  }
}

export const changeDraftDescriptorSchema = z.object({
  draftId: z.string().regex(CHANGE_DRAFT.idPattern),
  path: z.string(),
  relativePath: z.string(),
});

export type ChangeDraftDescriptor = z.infer<typeof changeDraftDescriptorSchema>;

export const changeDraftDeletionSchema = z.object({
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
  write(text: string): Promise<void>;
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
  create(text: string): Promise<ChangeDraftDescriptor>;
  list(): Promise<readonly ChangeDraftDescriptor[]>;
  delete(draftId: string): Promise<ChangeDraftDeletion>;
}

export interface ChangeDraftStoreOptions {
  readonly cwd: string;
  readonly dependencies?: ChangeDraftDependencies;
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
      return {
        write: (text) => handle.writeFile(text),
        close: () => handle.close(),
      };
    },
    remove: (path) => fs.unlink(path),
  },
  git: defaultGitDependencies,
  generateId: randomUUID,
};
