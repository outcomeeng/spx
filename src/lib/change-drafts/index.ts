import { join, relative, sep } from "node:path";

import {
  compareAsciiStrings,
  ERROR_CODE_FILE_EXISTS,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  resolveDraftsScopeDir,
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

const GIT_INSIDE_WORK_TREE = "true";
const GIT_CHECK_IGNORE_NOT_IGNORED = 1;

interface DraftContext {
  readonly productDir: string;
  readonly draftsDir: string;
  readonly dependencies: ChangeDraftDependencies;
}

export function isDraftKind(value: string): boolean {
  return CHANGE_DRAFT.kindPattern.test(value);
}

function requireKind(operation: DraftOperation, kind: string): string {
  if (!isDraftKind(kind)) throw new ChangeDraftError(CHANGE_DRAFT_ERROR.invalidKind, operation, kind);
  return kind;
}

function kindDirectory(context: DraftContext, kind: string): string {
  return join(context.draftsDir, kind);
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

async function storageExists(
  context: DraftContext,
  operation: DraftOperation,
  directory: string,
  create: boolean,
): Promise<boolean> {
  let path = context.productDir;
  for (const component of relative(context.productDir, directory).split(sep)) {
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
    requireSafeDirectory(stats, path, directory, operation);
  }
  return true;
}

function descriptor(context: DraftContext, operation: DraftOperation, kind: string, draftId: string) {
  if (!CHANGE_DRAFT.idPattern.test(draftId)) {
    throw new ChangeDraftError(CHANGE_DRAFT_ERROR.invalidId, operation, draftId);
  }
  const path = join(kindDirectory(context, kind), `${draftId}${CHANGE_DRAFT.extension}`);
  return { kind, draftId, path } satisfies ChangeDraftDescriptor;
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

/** Refuses a destination Git would publish: one inside a work tree that Git does not ignore. */
async function requireHiddenFromGit(context: DraftContext, operation: DraftOperation, path: string): Promise<void> {
  const inside = await context.dependencies.git.execa("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: context.productDir,
    reject: false,
  });
  if (inside.exitCode !== 0 || inside.stdout.trim() !== GIT_INSIDE_WORK_TREE) return;
  const relativePath = relative(context.productDir, path).split(sep).join("/");
  const ignored = await context.dependencies.git.execa("git", ["check-ignore", "--quiet", "--", relativePath], {
    cwd: context.productDir,
    reject: false,
  });
  if (ignored.exitCode !== 0) {
    throw new ChangeDraftError(
      ignored.exitCode === GIT_CHECK_IGNORE_NOT_IGNORED
        ? CHANGE_DRAFT_ERROR.visibleToGit
        : CHANGE_DRAFT_ERROR.operationFailed,
      operation,
      path,
      { cause: new Error(ignored.stderr) },
    );
  }
}

async function createEmptyDraft(context: DraftContext, path: string): Promise<void> {
  const file = await context.dependencies.fs.openExclusive(path, CHANGE_DRAFT.fileMode);
  try {
    await file.close();
  } catch (error) {
    try {
      await context.dependencies.fs.remove(path);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Failed to remove incomplete draft at ${path}`);
    }
    throw error;
  }
}

async function createDraft(context: DraftContext, kind: string): Promise<ChangeDraftDescriptor> {
  const operation = CHANGE_DRAFT_OPERATION.create;
  requireKind(operation, kind);
  const draft = descriptor(context, operation, kind, context.dependencies.generateId());
  const directory = kindDirectory(context, kind);
  return withOperation(operation, draft.path, async () => {
    await storageExists(context, operation, directory, false);
    await requireHiddenFromGit(context, operation, draft.path);
    await storageExists(context, operation, directory, true);
    await createEmptyDraft(context, draft.path);
    return draft;
  });
}

async function listKind(context: DraftContext, kind: string): Promise<ChangeDraftDescriptor[]> {
  const operation = CHANGE_DRAFT_OPERATION.list;
  const directory = kindDirectory(context, kind);
  if (!await storageExists(context, operation, directory, false)) return [];
  const drafts: ChangeDraftDescriptor[] = [];
  for (const name of await context.dependencies.fs.list(directory)) {
    if (!name.endsWith(CHANGE_DRAFT.extension)) continue;
    const draftId = name.slice(0, -CHANGE_DRAFT.extension.length);
    if (!CHANGE_DRAFT.idPattern.test(draftId)) continue;
    const draft = descriptor(context, operation, kind, draftId);
    if (await candidateExists(context, operation, draft.path)) drafts.push(draft);
  }
  return drafts;
}

function newestFirst(left: ChangeDraftDescriptor, right: ChangeDraftDescriptor): number {
  return compareAsciiStrings(right.draftId, left.draftId) || compareAsciiStrings(left.kind, right.kind);
}

async function listDrafts(context: DraftContext, kind: string | undefined): Promise<ChangeDraftDescriptor[]> {
  const operation = CHANGE_DRAFT_OPERATION.list;
  if (kind !== undefined) {
    requireKind(operation, kind);
    return withOperation(operation, kindDirectory(context, kind), async () => {
      return (await listKind(context, kind)).sort(newestFirst);
    });
  }
  return withOperation(operation, context.draftsDir, async () => {
    if (!await storageExists(context, operation, context.draftsDir, false)) return [];
    const drafts: ChangeDraftDescriptor[] = [];
    for (const name of await context.dependencies.fs.list(context.draftsDir)) {
      if (!isDraftKind(name)) continue;
      drafts.push(...await listKind(context, name));
    }
    return drafts.sort(newestFirst);
  });
}

async function deleteDraft(context: DraftContext, kind: string, draftId: string) {
  const operation = CHANGE_DRAFT_OPERATION.delete;
  requireKind(operation, kind);
  const draft = descriptor(context, operation, kind, draftId);
  return withOperation(operation, draft.path, async () => {
    const present = await storageExists(context, operation, kindDirectory(context, kind), false)
      && await candidateExists(context, operation, draft.path);
    if (!present) return { kind, draftId, removed: false };
    await context.dependencies.fs.remove(draft.path);
    return { kind, draftId, removed: true };
  });
}

export async function createChangeDraftStore(options: ChangeDraftStoreOptions): Promise<ChangeDraftStore> {
  const dependencies = options.dependencies ?? changeDraftDependencies;
  const { productDir, draftsDir } = await resolveDraftsScopeDir({ cwd: options.cwd, deps: dependencies.git });
  const context: DraftContext = { productDir, draftsDir, dependencies };
  return {
    create: (kind) => createDraft(context, kind),
    list: (kind) => listDrafts(context, kind),
    delete: (kind, draftId) => deleteDraft(context, kind, draftId),
  };
}
