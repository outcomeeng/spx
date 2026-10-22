/**
 * Spec-tree node-spec front-matter rule.
 *
 * A node spec declares its identity in an `id` front-matter entry and may bound
 * its `malleability`. This rule reports, for each node spec the rule
 * configuration lists, an absent `id` on a canonical-form spec, an `id` that is
 * not a UUIDv7 in canonical lowercase hyphenated form, an `id` another listed
 * spec repeats, and a `malleability` outside the supported values. The
 * configuration carries the product root and the identity of every node spec in
 * the tree, so uniqueness is judged across the tree whichever files a run
 * validates.
 *
 * @module validation/steps/markdown-node-spec-rule
 */

import { relative, resolve, sep } from "node:path";

import { parse as parseYaml } from "yaml";

import { NODE_STATUS_MALLEABILITY } from "@/lib/node-status/claim";

import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";

import type { MarkdownlintCustomRule } from "./markdown-link-shape-rule";

// =============================================================================
// CONSTANTS
// =============================================================================

export const MARKDOWN_NODE_SPEC_RULE_NAME = "spx-node-spec-front-matter";

/** Rule configuration keys: the product root and the identity of every node spec in the tree. */
export const MARKDOWN_NODE_SPEC_RULE_CONFIG = {
  ROOT_PATH: "root_path",
  NODE_SPECS: "node_specs",
} as const;

export const NODE_SPEC_FRONT_MATTER_KEY = {
  ID: "id",
  MALLEABILITY: "malleability",
} as const;

export const NODE_SPEC_DIAGNOSTICS = {
  ID_REQUIRED: "is required in a canonical-form node spec; declare a UUIDv7 id in the front matter",
  ID_NOT_UUID_V7: "is not a UUIDv7 in canonical lowercase hyphenated form",
  ID_REPEATED: "is repeated by",
  MALLEABILITY_UNSUPPORTED: "is not a supported malleability; use spec, verification, or implementation",
} as const;

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const FIRST_LINE = 1;
const PATH_LIST_SEPARATOR = ", ";
const SUPPORTED_MALLEABILITIES: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_MALLEABILITY));

// =============================================================================
// TYPES
// =============================================================================

/** The identity one node spec declares, as the rule configuration carries it. */
export interface NodeSpecIdentity {
  /** Product-relative path of the spec, with `/` separators. */
  readonly path: string;
  /** Whether the spec is in the canonical `{slug}.spec.md` form, which requires an `id`. */
  readonly canonical: boolean;
  /** The `id` the spec declares, or `undefined` when it declares none or its front matter is unreadable. */
  readonly id: string | undefined;
}

interface NodeSpecRuleParams {
  readonly name: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly frontMatterLines: readonly string[];
}

// =============================================================================
// FRONT MATTER
// =============================================================================

/** The mapping a front-matter body declares, or `undefined` when it is not a readable mapping. */
export function parseFrontMatterMapping(body: string): Readonly<Record<string, unknown>> | undefined {
  let parsed: unknown;
  try {
    parsed = parseYaml(body);
  } catch {
    return undefined;
  }
  if (parsed === null) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  return parsed as Readonly<Record<string, unknown>>;
}

/** The text a declared scalar front-matter value reads as, or `undefined` for an absent or empty value. */
export function declaredText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function isNodeSpecIdentity(value: unknown): value is NodeSpecIdentity {
  return typeof value === "object" && value !== null && "path" in value && "canonical" in value;
}

function nodeSpecIdentities(config: Readonly<Record<string, unknown>>): readonly NodeSpecIdentity[] | undefined {
  const identities = config[MARKDOWN_NODE_SPEC_RULE_CONFIG.NODE_SPECS];
  if (!Array.isArray(identities) || !identities.every(isNodeSpecIdentity)) return undefined;
  return identities;
}

function keyLine(frontMatterLines: readonly string[], key: string): number {
  const index = frontMatterLines.findIndex((line) => line.startsWith(`${key}:`));
  return index < 0 ? FIRST_LINE : index + 1;
}

/** The YAML between the fences of the front matter, which markdownlint may follow with blank lines. */
function frontMatterBody(frontMatterLines: readonly string[]): string {
  const fenced = [...frontMatterLines];
  while (fenced.length > 0 && fenced[fenced.length - 1].trim() === "") fenced.pop();
  return fenced.slice(1, -1).join("\n");
}

function citingFile(params: NodeSpecRuleParams): string | undefined {
  const rootPath = params.config[MARKDOWN_NODE_SPEC_RULE_CONFIG.ROOT_PATH];
  if (typeof rootPath !== "string") return undefined;
  return relative(rootPath, resolve(params.name)).split(sep).join(TRACKED_PATH_DIRECTORY_SEPARATOR);
}

// =============================================================================
// RULE
// =============================================================================

type NodeSpecOnError = (error: { readonly lineNumber: number; readonly detail: string }) => void;

/**
 * markdownlint rejects a reported line outside the body that follows the front matter, so the rule
 * reports line 1 and carries the front-matter line in the detail, which the step restores.
 */
const FRONT_MATTER_LINE_MARKER = {
  PREFIX: "line ",
  SEPARATOR: ": ",
} as const;
const FRONT_MATTER_LINE_PATTERN = /\[line (\d+): /u;

/** The error a front-matter finding reports once its carried line replaces the body line markdownlint reported. */
export function restoreFrontMatterLine(
  error: { readonly line: number; readonly detail: string },
): { readonly line: number; readonly detail: string } {
  const match = FRONT_MATTER_LINE_PATTERN.exec(error.detail);
  if (match === null) return error;
  return {
    line: Number.parseInt(match[1], 10),
    detail: error.detail.replace(FRONT_MATTER_LINE_PATTERN, "["),
  };
}

function quoted(value: string): string {
  return `"${value}"`;
}

function reportId(
  declared: string | undefined,
  identity: NodeSpecIdentity,
  identities: readonly NodeSpecIdentity[],
  line: number,
  onError: NodeSpecOnError,
): void {
  if (declared === undefined) {
    if (identity.canonical) {
      onError({ lineNumber: line, detail: `${NODE_SPEC_FRONT_MATTER_KEY.ID} ${NODE_SPEC_DIAGNOSTICS.ID_REQUIRED}` });
    }
    return;
  }
  if (!UUID_V7_PATTERN.test(declared)) {
    onError({ lineNumber: line, detail: `${quoted(declared)} ${NODE_SPEC_DIAGNOSTICS.ID_NOT_UUID_V7}` });
    return;
  }
  const others = identities.filter((other) => other.path !== identity.path && other.id === declared);
  if (others.length > 0) {
    const paths = others.map((other) => other.path).join(PATH_LIST_SEPARATOR);
    onError({ lineNumber: line, detail: `${quoted(declared)} ${NODE_SPEC_DIAGNOSTICS.ID_REPEATED} ${paths}` });
  }
}

function reportMalleability(declared: string | undefined, line: number, onError: NodeSpecOnError): void {
  if (declared === undefined || SUPPORTED_MALLEABILITIES.has(declared)) return;
  onError({ lineNumber: line, detail: `${quoted(declared)} ${NODE_SPEC_DIAGNOSTICS.MALLEABILITY_UNSUPPORTED}` });
}

/**
 * The markdownlint custom rule enforcing the node-spec `id` and `malleability`
 * front matter. A file the rule configuration does not list as a node spec is
 * not judged.
 */
export const markdownNodeSpecRule: MarkdownlintCustomRule = {
  names: [MARKDOWN_NODE_SPEC_RULE_NAME],
  description: "Node specs should declare a unique UUIDv7 id and a supported malleability",
  tags: ["front-matter"],
  parser: "none",
  function: (params, reportToMarkdownlint) => {
    const onError: NodeSpecOnError = ({ lineNumber, detail }) => {
      reportToMarkdownlint({
        lineNumber: FIRST_LINE,
        detail: `${FRONT_MATTER_LINE_MARKER.PREFIX}${lineNumber}${FRONT_MATTER_LINE_MARKER.SEPARATOR}${detail}`,
      });
    };
    const ruleParams = params as unknown as NodeSpecRuleParams;
    const identities = nodeSpecIdentities(ruleParams.config);
    const path = citingFile(ruleParams);
    if (identities === undefined || path === undefined) return;
    const identity = identities.find((candidate) => candidate.path === path);
    if (identity === undefined) return;

    const frontMatterLines = ruleParams.frontMatterLines;
    const body = frontMatterBody(frontMatterLines);
    const mapping = frontMatterLines.length === 0 ? {} : parseFrontMatterMapping(body);
    if (mapping === undefined) return;

    reportId(
      declaredText(mapping[NODE_SPEC_FRONT_MATTER_KEY.ID]),
      identity,
      identities,
      keyLine(frontMatterLines, NODE_SPEC_FRONT_MATTER_KEY.ID),
      onError,
    );
    reportMalleability(
      declaredText(mapping[NODE_SPEC_FRONT_MATTER_KEY.MALLEABILITY]),
      keyLine(frontMatterLines, NODE_SPEC_FRONT_MATTER_KEY.MALLEABILITY),
      onError,
    );
  },
};
