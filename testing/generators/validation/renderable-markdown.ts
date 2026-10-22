/**
 * Generators for context-renderable Markdown: files validation admits and files that each violate one
 * clause of the context-renderable rule.
 */
import { join } from "node:path";

import * as fc from "fast-check";

import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

import {
  arbitrarySeedPair,
  arbitraryUuidV7,
  canonicalNodeSpec,
  FRONT_MATTER_FENCE,
  NODE_SPEC_FRONT_MATTER_KEY,
  type NodeSpecFile,
  type NodeSpecSeed,
  nodeSpecText,
  OPENING_OUTPUT_KINDS,
  SPEC_SUFFIX_CANONICAL,
} from "./node-spec";

const DECISION_KINDS = [KIND_REGISTRY.adr, KIND_REGISTRY.pdr] as const;
const OUTCOME_RECORD_SUFFIX = ".outcome.md";
const PRODUCT_KIND_ENTRY = "kind: product";
const MALFORMED_FRONT_MATTER_VALUE = "[unclosed";
const INVALID_UTF8_BYTES = [0xff, 0xfe, 0xfd] as const;
const DECISION_STATEMENT = "The product resolves each request from one source of truth.";
const LINE_SEPARATOR = "\n";

/** A file written into a validation project. */
export interface ProjectFile {
  readonly path: string;
  readonly content: string | Uint8Array;
}

/** A set of files and the product-relative path among them that validation must admit or report. */
export interface RenderableCase {
  readonly name: string;
  readonly files: readonly ProjectFile[];
  readonly subject: string;
}

export interface RenderableScenario {
  readonly seed: NodeSpecSeed;
  readonly other: NodeSpecSeed;
  readonly ids: readonly [string, string, string];
}

export function arbitraryRenderableScenario(): fc.Arbitrary<RenderableScenario> {
  return fc.tuple(
    arbitrarySeedPair(),
    fc.tuple(arbitraryUuidV7(), arbitraryUuidV7(), arbitraryUuidV7()).filter((ids) => new Set(ids).size === ids.length),
  ).map(([[seed, other], ids]) => ({ seed, other, ids }));
}

function nodeFile(spec: NodeSpecFile): ProjectFile {
  return { path: spec.path, content: spec.content };
}

function decisionText(title: string, withStatement: boolean): string {
  return [
    `# ${title}`,
    "",
    ...(withStatement ? [DECISION_STATEMENT, ""] : []),
    "## Verification",
    "",
    "### Testing",
    "",
    "- The decision holds",
    "",
  ].join(LINE_SEPARATOR);
}

function decisionPath(seed: NodeSpecSeed, suffix: string): string {
  return join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, `${seed.index}-${seed.slug}${suffix}`);
}

function frontMatterText(entries: readonly string[]): string {
  return [FRONT_MATTER_FENCE, ...entries, FRONT_MATTER_FENCE, ""].join(LINE_SEPARATOR);
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

/** Files validation admits: a product spec with no opening, decisions with statements, one spec per resolvable kind opening. */
export function renderableAdmittedCases(scenario: RenderableScenario): readonly RenderableCase[] {
  const [productId, nodeId, variantId] = scenario.ids;
  const productPath = join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, `${scenario.other.slug}${SPEC_SUFFIX_CANONICAL}`);
  const product: RenderableCase = {
    name: SPEC_TREE_CONFIG.PRODUCT.KIND,
    files: [{
      path: productPath,
      content: `${
        frontMatterText([`${NODE_SPEC_FRONT_MATTER_KEY.ID}: ${quoted(productId)}`, PRODUCT_KIND_ENTRY])
      }# ${scenario.other.slug}\n`,
    }],
    subject: productPath,
  };
  const decisions = DECISION_KINDS.map((kind): RenderableCase => {
    const path = decisionPath(scenario.seed, kind.suffix);
    return { name: kind.label, files: [{ path, content: decisionText(scenario.seed.slug, true) }], subject: path };
  });
  const outputs = OPENING_OUTPUT_KINDS.map((kind): RenderableCase => {
    const spec = canonicalNodeSpec({ ...scenario.seed, kind }, { id: nodeId });
    return { name: kind, files: [nodeFile(spec)], subject: spec.path };
  });
  const parent = canonicalNodeSpec({ ...scenario.other, kind: "domain" }, { id: nodeId });
  const variantPath = join(
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    parent.nodeDirectory,
    `${scenario.seed.index}-${scenario.seed.slug}${KIND_REGISTRY.variant.suffix}`,
    `${scenario.seed.slug}${SPEC_SUFFIX_CANONICAL}`,
  );
  const variant: RenderableCase = {
    name: KIND_REGISTRY.variant.suffix,
    files: [nodeFile(parent), {
      path: variantPath,
      content: nodeSpecText({ id: variantId }, scenario.seed.slug, KIND_REGISTRY.domain.opening).content,
    }],
    subject: variantPath,
  };
  return [product, ...decisions, ...outputs, variant];
}

/** Files validation reports, each violating one clause of the context-renderable rule. */
export function renderableViolationCases(scenario: RenderableScenario): readonly RenderableCase[] {
  const [, nodeId, otherId] = scenario.ids;
  const seed: NodeSpecSeed = { ...scenario.seed, kind: "capability" };
  const opening = KIND_REGISTRY[seed.kind].opening;
  const foreignOpening =
    OPENING_OUTPUT_KINDS.map((kind) => KIND_REGISTRY[kind].opening).find((keyword) => keyword !== opening) ?? opening;
  const base = canonicalNodeSpec(seed, { id: nodeId });
  const onBase = (name: string, content: string | Uint8Array): RenderableCase => ({
    name,
    files: [{ path: base.path, content }],
    subject: base.path,
  });
  const adrPath = decisionPath(scenario.seed, KIND_REGISTRY.adr.suffix);
  const pdrPath = decisionPath(scenario.seed, KIND_REGISTRY.pdr.suffix);
  const orphanVariant = canonicalNodeSpec({ ...scenario.other, kind: "variant" }, { id: nodeId });
  const outcomePath = join(
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    base.nodeDirectory,
    `${scenario.other.slug}${OUTCOME_RECORD_SUFFIX}`,
  );
  const missingDecision = decisionPath(scenario.other, KIND_REGISTRY.adr.suffix);
  return [
    {
      name: "adr without a decision statement",
      files: [{ path: adrPath, content: decisionText(seed.slug, false) }],
      subject: adrPath,
    },
    {
      name: "pdr without a decision statement",
      files: [{ path: pdrPath, content: decisionText(seed.slug, false) }],
      subject: pdrPath,
    },
    onBase(
      "required opening absent",
      base.content.split(LINE_SEPARATOR).filter((line) => !line.startsWith(opening)).join(LINE_SEPARATOR),
    ),
    onBase("opening malformed", base.content.replace(opening, foreignOpening)),
    onBase("front matter malformed", base.content.replace(quoted(nodeId), MALFORMED_FRONT_MATTER_VALUE)),
    onBase("strict UTF-8 decoding fails", Uint8Array.from([...Buffer.from(base.content), ...INVALID_UTF8_BYTES])),
    { name: "kind with no resolvable opening", files: [nodeFile(orphanVariant)], subject: orphanVariant.path },
    onBase(
      "decision citation unresolved",
      `${base.content}${LINE_SEPARATOR}See [the decision](${missingDecision}).${LINE_SEPARATOR}`,
    ),
    {
      name: "outcome record filename differs from its owning node slug",
      files: [nodeFile(base), {
        path: outcomePath,
        content: `${frontMatterText([`${NODE_SPEC_FRONT_MATTER_KEY.ID}: ${quoted(otherId)}`])}# Outcome\n`,
      }],
      subject: outcomePath,
    },
  ];
}
