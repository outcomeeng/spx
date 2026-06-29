/**
 * Real filesystem adapter for worktree occupancy claims.
 *
 * @module lib/worktree-occupancy-file-system
 */

import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  readlink as nodeReadlink,
  rename as nodeRename,
  rm as nodeRm,
  symlink as nodeSymlink,
  writeFile as nodeWriteFile,
} from "node:fs/promises";

import type { OccupancyFileSystem } from "@/domains/worktree/occupancy-store";

export const defaultOccupancyFileSystem: OccupancyFileSystem = {
  mkdir: async (path, options) => {
    await nodeMkdir(path, options);
  },
  writeFile: async (path, data) => {
    await nodeWriteFile(path, data);
  },
  rename: nodeRename,
  symlink: nodeSymlink,
  readlink: nodeReadlink,
  readFile: nodeReadFile,
  rm: async (path, options) => {
    await nodeRm(path, options);
  },
};
