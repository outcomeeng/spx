/**
 * Node-spec identity index for the markdown node-spec rule.
 *
 * Reads the `id` of every spec the spec-tree library recognizes under the
 * spec-tree root from the directory, tracked or not, so a run that validates a
 * subset of the tree still sees every identity and a newly authored spec
 * git has not yet seen is judged like any other.
 *
 * @module validation/steps/markdown-node-spec-index
 */

import {
  createFilesystemSpecTreeSource,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_GRAMMAR,
  type SpecTreeGrammarSelection,
  splitSpecContextFrontMatter,
} from "@/lib/spec-tree";

import {
  declaredText,
  NODE_SPEC_FRONT_MATTER_KEY,
  type NodeSpecIdentity,
  parseFrontMatterMapping,
} from "./markdown-node-spec-rule";

function declaredId(text: string, path: string): string | undefined {
  try {
    const { frontMatter } = splitSpecContextFrontMatter(text, path);
    if (frontMatter === undefined) return undefined;
    return declaredText(parseFrontMatterMapping(frontMatter)?.[NODE_SPEC_FRONT_MATTER_KEY.ID]);
  } catch {
    return undefined;
  }
}

/** The identity of every product spec and node spec under the spec-tree root. */
export async function readNodeSpecIdentities(
  productDir: string,
  selection: SpecTreeGrammarSelection,
): Promise<readonly NodeSpecIdentity[]> {
  const source = createFilesystemSpecTreeSource({
    productDir,
    selection,
  });
  const identities: NodeSpecIdentity[] = [];
  for await (const entry of source.entries()) {
    const isSpec = entry.type === SPEC_TREE_ENTRY_TYPE.NODE || entry.type === SPEC_TREE_ENTRY_TYPE.PRODUCT;
    const path = entry.ref?.path;
    if (!isSpec || path === undefined || source.readText === undefined || entry.ref === undefined) continue;
    let text: string;
    try {
      text = await source.readText(entry.ref);
    } catch {
      continue;
    }
    identities.push({
      path,
      canonical: path.endsWith(SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX),
      id: declaredId(text, path),
    });
  }
  return identities;
}
