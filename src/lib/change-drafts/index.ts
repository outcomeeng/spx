import { join, relative, sep } from "node:path";

import { detectWorktreeProductRoot } from "@/lib/git/root";
import {
  compareAsciiStrings,
  ERROR_CODE_FILE_EXISTS,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  worktreeScopeDir,
} from "@/lib/state-store";

import {
  CHANGE_DRAFT,
  CHANGE_DRAFT_ERROR,
  CHANGE_DRAFT_OPERATION,
  type ChangeDraftDependencies,
  changeDraftDependencies,
  type ChangeDraftDescriptor,
  ChangeDraftError,
  type ChangeDraftStats,
  type ChangeDraftStore,
  type ChangeDraftStoreOptions,
} from "./contract";

type DraftOperation = (typeof CHANGE_DRAFT_OPERATION)[keyof typeof CHANGE_DRAFT_OPERATION];

interface DraftContext {
  readonly productDir: string;
  readonly directory: string;
  readonly dependencies: ChangeDraftDependencies;
}

async function inspect(context: DraftContext, path: string): Promise<ChangeDraftStats | undefined> {
  try {
    return await context.dependencies.fs.inspect(path);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return undefined;
    throw error;
  }
}

function requireSafeDirectory(
  stats: ChangeDraftStats | undefined,
  path: string,
  draftDirectory: string,
  operation: DraftOperation,
): void {
  if (stats === undefined || stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new ChangeDraftError(CHANGE_DRAFT_ERROR.unsafeStorage, operation, path);
  }
  if (
    operation === CHANGE_DRAFT_OPERATION.create
    && path === draftDirectory
    && (stats.mode & CHANGE_DRAFT.permissionMask) !== CHANGE_DRAFT.directoryMode
  ) {
    throw new ChangeDraftError(CHANGE_DRAFT_ERROR.unsafeStorage, operation, path);
  }
}

async function storageExists(context: DraftContext, operation: DraftOperation, create: boolean): Promise<boolean> {
  let path = context.productDir;
  for (const component of relative(context.productDir, context.directory).split(sep)) {
    path = join(path, component);
    let stats = await inspect(context, path);
    if (stats === undefined) {
      if (!create) return false;
      try {
        await context.dependencies.fs.makeDirectory(path, CHANGE_DRAFT.directoryMode);
      } catch (error) {
        if (!hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) throw error;
      }
      stats = await inspect(context, path);
    }
    requireSafeDirectory(stats, path, context.directory, operation);
  }
  return true;
}

function descriptor(context: DraftContext, operation: DraftOperation, draftId: string): ChangeDraftDescriptor {
  if (!CHANGE_DRAFT.idPattern.test(draftId)) {
    throw new ChangeDraftError(CHANGE_DRAFT_ERROR.invalidId, operation, draftId);
  }
  const path = join(context.directory, `${draftId}${CHANGE_DRAFT.extension}`);
  return { draftId, path, relativePath: relative(context.productDir, path).split(sep).join("/") };
}

async function candidateExists(context: DraftContext, operation: DraftOperation, path: string): Promise<boolean> {
  const stats = await inspect(context, path);
  if (stats === undefined) return false;
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new ChangeDraftError(CHANGE_DRAFT_ERROR.unsafeStorage, operation, path);
  }
  return true;
}

async function withOperation<T>(operation: DraftOperation, path: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ChangeDraftError) throw error;
    throw new ChangeDraftError(CHANGE_DRAFT_ERROR.operationFailed, operation, path, { cause: error });
  }
}

async function writeDraft(context: DraftContext, path: string, text: string): Promise<void> {
  const file = await context.dependencies.fs.openExclusive(path, CHANGE_DRAFT.fileMode);
  try {
    try {
      await file.write(text);
    } finally {
      await file.close();
    }
  } catch (error) {
    try {
      await context.dependencies.fs.remove(path);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Failed to remove incomplete draft at ${path}`);
    }
    throw error;
  }
}

async function createDraft(context: DraftContext, text: string): Promise<ChangeDraftDescriptor> {
  const operation = CHANGE_DRAFT_OPERATION.create;
  const draft = descriptor(context, operation, context.dependencies.generateId());
  return withOperation(operation, draft.path, async () => {
    await storageExists(context, operation, false);
    const ignored = await context.dependencies.git.execa("git", ["check-ignore", "--quiet", "--", draft.relativePath], {
      cwd: context.productDir,
      reject: false,
    });
    if (ignored.exitCode !== 0) {
      throw new ChangeDraftError(
        ignored.exitCode === 1 ? CHANGE_DRAFT_ERROR.visibleToGit : CHANGE_DRAFT_ERROR.operationFailed,
        operation,
        draft.path,
        { cause: new Error(ignored.stderr) },
      );
    }
    await storageExists(context, operation, true);
    await writeDraft(context, draft.path, text);
    return draft;
  });
}

async function listDrafts(context: DraftContext): Promise<readonly ChangeDraftDescriptor[]> {
  const operation = CHANGE_DRAFT_OPERATION.list;
  return withOperation(operation, context.directory, async () => {
    if (!await storageExists(context, operation, false)) return [];
    const drafts: ChangeDraftDescriptor[] = [];
    for (const name of await context.dependencies.fs.list(context.directory)) {
      if (!name.endsWith(CHANGE_DRAFT.extension)) continue;
      const draftId = name.slice(0, -CHANGE_DRAFT.extension.length);
      if (!CHANGE_DRAFT.idPattern.test(draftId)) continue;
      const draft = descriptor(context, operation, draftId);
      if (await candidateExists(context, operation, draft.path)) drafts.push(draft);
    }
    return drafts.sort((left, right) => compareAsciiStrings(left.draftId, right.draftId));
  });
}

export async function createChangeDraftStore(options: ChangeDraftStoreOptions): Promise<ChangeDraftStore> {
  const dependencies = options.dependencies ?? changeDraftDependencies;
  const { productDir } = await detectWorktreeProductRoot(options.cwd, dependencies.git);
  const context = { productDir, directory: join(worktreeScopeDir(productDir), CHANGE_DRAFT.directory), dependencies };
  return {
    create: (text) => createDraft(context, text),
    list: () => listDrafts(context),
    delete: async (draftId) => {
      const operation = CHANGE_DRAFT_OPERATION.delete;
      const draft = descriptor(context, operation, draftId);
      return withOperation(operation, draft.path, async () => {
        if (!await storageExists(context, operation, false) || !await candidateExists(context, operation, draft.path)) {
          return { draftId, removed: false };
        }
        await dependencies.fs.remove(draft.path);
        return { draftId, removed: true };
      });
    },
  };
}
