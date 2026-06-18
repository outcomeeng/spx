/**
 * Real filesystem adapter for worktree occupancy claims.
 *
 * @module lib/worktree-occupancy-file-system
 */

import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  rm as nodeRm,
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
  readFile: nodeReadFile,
  rm: async (path, options) => {
    await nodeRm(path, options);
  },
};
