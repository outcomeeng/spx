import { PRECOMMIT_DEFAULTS, type PrecommitConfig } from "./config";

export const FILE_CATEGORIES = {
  TEST: "test",
  SOURCE: "source",
  OTHER: "other",
} as const;

export type FileCategory = (typeof FILE_CATEGORIES)[keyof typeof FILE_CATEGORIES];

export function categorizeFile(filePath: string, config: PrecommitConfig = PRECOMMIT_DEFAULTS): FileCategory {
  if (filePath.includes(config.testPattern)) {
    return FILE_CATEGORIES.TEST;
  }
  if (config.sourceDirs.some((dir) => filePath.startsWith(dir))) {
    return FILE_CATEGORIES.SOURCE;
  }
  return FILE_CATEGORIES.OTHER;
}

export function filterTestRelevantFiles(files: string[], config: PrecommitConfig = PRECOMMIT_DEFAULTS): string[] {
  return files.filter((file) => {
    const category = categorizeFile(file, config);
    return category === FILE_CATEGORIES.TEST || category === FILE_CATEGORIES.SOURCE;
  });
}
