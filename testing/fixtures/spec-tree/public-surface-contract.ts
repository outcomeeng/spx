import {
  findNextSpecTreeNode,
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  resolveSpecTreePathOwnership,
  SPEC_TREE_GRAMMAR,
  type SpecTreeNode,
  type SpecTreeOptions,
  type SpecTreePathOwnershipResult,
  type SpecTreeProjection,
  type SpecTreeSnapshot,
  type SpecTreeSource,
} from "@/lib/spec-tree";

declare const source: SpecTreeSource;
declare const options: SpecTreeOptions;
declare const snapshot: SpecTreeSnapshot;
declare const node: SpecTreeNode;
declare const projection: SpecTreeProjection;
declare const ownership: SpecTreePathOwnershipResult;

void source;
void options;
void snapshot;
void node;
void projection;
void ownership;
void readSpecTree;
void projectSpecTree;
void findNextSpecTreeNode;
void resolveSpecTreePathOwnership;
void KIND_REGISTRY;
void SPEC_TREE_GRAMMAR;
