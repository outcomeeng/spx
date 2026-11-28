/**
 * Generators for the methodology-plugin domain: the content a plugins
 * repository publishes per coding agent, coding-agent names, tree-address
 * segments, `supports` ranges, and methodology source records. Every
 * methodology version they need comes from the methodology-version generators.
 *
 * @module generators/methodology/plugin
 */

import * as fc from "fast-check";

import { REGISTERED_AGENT_IDS } from "@/lib/agent-environment";
import {
  FETCH_CODING_AGENTS,
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
  FOUNDATION_PLUGIN_NAME,
  INSTRUCTION_TEMPLATE_RELATIVE_PATH,
  METHODOLOGY_CODING_AGENTS,
  METHODOLOGY_MIGRATION_ROOT,
  METHODOLOGY_TREE_ROOT,
  type MethodologySourceMigration,
  type MethodologySourceRecord,
  MIGRATION_ENTRY_FILE_NAME,
  RANGE_ALTERNATIVE_SEPARATOR,
  RANGE_COMPARATOR,
  UNDERSTAND_SKILL_RELATIVE_DIR,
} from "@/lib/methodology";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import {
  arbitraryMethodologyLine,
  arbitraryMethodologyVersion,
  type GeneratedMethodologyVersion,
} from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";

/** The separator of a package-root-relative resource address, which is POSIX on every host. */
const RESOURCE_ADDRESS_SEPARATOR = "/";

/**
 * The address a foundation core is framed under, by the declared law: the
 * package-root-relative bundle address of the line and coding agent, followed
 * by the manifest's `core` value.
 */
export function methodologyFoundationDocumentPath(tree: {
  readonly line: string;
  readonly codingAgent: string;
  readonly corePath: string;
}): string {
  return [METHODOLOGY_TREE_ROOT, tree.line, tree.codingAgent, FOUNDATION_PLUGIN_NAME, tree.corePath].join(
    RESOURCE_ADDRESS_SEPARATOR,
  );
}

/** A coding-agent directory name: one of the ids the agent registry declares. */
export function arbitraryCodingAgentName(): fc.Arbitrary<string> {
  return fc.constantFrom(...REGISTERED_AGENT_IDS);
}

/** Two different coding-agent directory names, each an id the agent registry declares. */
export function arbitraryDistinctCodingAgentNames(): fc.Arbitrary<readonly [string, string]> {
  return fc.shuffledSubarray([...REGISTERED_AGENT_IDS], { minLength: 2, maxLength: 2 })
    .map(([first, second]) => [first, second] as const);
}

/** A path component that must be rejected as a tree segment: traversal, separators, or empty. */
export function arbitraryUnsafeTreeSegment(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(""),
    fc.constant("."),
    fc.constant(".."),
    fc.tuple(arbitraryPathSegment(), arbitraryPathSegment()).map((parts) => parts.join("/")),
    fc.tuple(arbitraryPathSegment(), arbitraryPathSegment()).map((parts) => parts.join("\\")),
  );
}

/** What one coding agent's built plugin carries at a plugins-repository revision. */
export interface GeneratedPluginContent {
  readonly pluginName: string;
  readonly pluginVersion: string;
  readonly provides?: string;
  readonly supports?: string;
  /** The `template_version` of the plugin's instruction-block template. */
  readonly templateVersion: string;
  /** When supplied, the exact text published as the instruction-block template instead of one carrying `templateVersion`. */
  readonly templateText?: string;
  /** Files under the understand skill directory, keyed by skill-relative path. */
  readonly skillFiles: ReadonlyMap<string, string>;
}

/** The plugins-repository content for every coding agent the fetch reads. */
export interface GeneratedPluginsContent {
  readonly agents: ReadonlyMap<string, GeneratedPluginContent>;
}

/** A short markdown body, the shape of a published skill resource or a bystander file. */
export function arbitraryMarkdownBody(): fc.Arbitrary<string> {
  return fc.array(fc.string({ minLength: 1, maxLength: 24 }), { minLength: 1, maxLength: 4 })
    .map((lines) => `${lines.join("\n")}\n`);
}

function skillFiles(): fc.Arbitrary<ReadonlyMap<string, string>> {
  return fc.tuple(
    arbitraryPathSegment(),
    arbitraryMarkdownBody(),
    arbitraryMarkdownBody(),
    arbitraryMarkdownBody(),
    arbitraryMarkdownBody(),
  )
    .map(([slug, core, reference, template, example]) => {
      const corePath = "SKILL.md";
      const referencePath = `references/${slug}.md`;
      const templatePath = `templates/${slug}.md`;
      const examplePath = `examples/${slug}.md`;
      const prefix = (path: string): string => `${UNDERSTAND_SKILL_RELATIVE_DIR}/${path}`;
      const manifest = {
        [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: FOUNDATION_MANIFEST_SCHEMA_VERSION,
        [FOUNDATION_MANIFEST_FIELDS.CORE]: prefix(corePath),
        [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [prefix(referencePath)],
        [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [prefix(templatePath)],
        [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [prefix(examplePath)],
      };
      const manifestRelative = FOUNDATION_MANIFEST_RELATIVE_PATH.slice(UNDERSTAND_SKILL_RELATIVE_DIR.length + 1);
      return new Map([
        [manifestRelative, `${JSON.stringify(manifest, null, 2)}\n`],
        [corePath, core],
        [referencePath, reference],
        [templatePath, template],
        [examplePath, example],
      ]);
    });
}

/** One agent's plugin content; `provides` is the line every agent agrees on when supplied. */
export function arbitraryPluginContent(
  provides?: string,
  templateVersion?: string,
): fc.Arbitrary<GeneratedPluginContent> {
  return fc.tuple(
    arbitraryPathSegment(),
    arbitraryMethodologyVersion(),
    skillFiles(),
    arbitraryMethodologyLine(),
    arbitraryMethodologyVersion(),
  )
    .map(([pluginName, pluginVersion, files, supportsLine, drawnTemplateVersion]) => ({
      pluginName,
      pluginVersion: pluginVersion.text,
      ...(provides === undefined ? {} : { provides, supports: `>=${supportsLine}` }),
      templateVersion: templateVersion ?? drawnTemplateVersion.text,
      skillFiles: files,
    }));
}

/** The text of an instruction-block template whose front matter carries `templateVersion` as a double-quoted scalar. */
export function instructionTemplateText(templateVersion: string): string {
  return `---\ntemplate_version: ${JSON.stringify(templateVersion)}\n---\n\n# Instruction block\n`;
}

/** Plugins content for every fetched coding agent, all declaring the same `provides` when one is supplied. */
export function arbitraryPluginsContent(provides?: string): fc.Arbitrary<GeneratedPluginsContent> {
  const agents = Object.keys(FETCH_CODING_AGENTS);
  return arbitraryMethodologyVersion().chain((templateVersion) =>
    fc.tuple(...agents.map(() => arbitraryPluginContent(provides, templateVersion.text))).map((contents) => ({
      agents: new Map(agents.map((agent, index) => [agent, contents[index]])),
    }))
  ).filter((content) =>
    // The template version is its own value: it equals neither the methodology version the plugins provide
    // nor any plugin's distribution version, so a record that substituted one for it would differ.
    [...content.agents.values()].every((agentContent) =>
      agentContent.templateVersion !== provides
      && [...content.agents.values()].every((other) => other.pluginVersion !== agentContent.templateVersion)
    )
  );
}

/** Plugins content whose coding agents carry different `template_version` values, every agent declaring `provides` when supplied. */
export function arbitraryTemplateDisagreeingPluginsContent(provides?: string): fc.Arbitrary<GeneratedPluginsContent> {
  const agents = Object.keys(FETCH_CODING_AGENTS);
  return fc.tuple(arbitraryMethodologyVersion(), arbitraryMethodologyVersion())
    .filter(([first, second]) => first.text !== second.text)
    .chain(([first, second]) =>
      fc.tuple(...agents.map((_, index) => arbitraryPluginContent(provides, index === 0 ? first.text : second.text)))
        .map((contents) => ({
          agents: new Map(agents.map((agent, index) => [agent, contents[index]])),
        }))
    );
}

/** Plugins content whose first coding agent publishes a template with no front matter, hence no `template_version`. */
export function arbitraryTemplateLessPluginsContent(provides?: string): fc.Arbitrary<GeneratedPluginsContent> {
  return fc.tuple(arbitraryPluginsContent(provides), arbitraryMarkdownBody()).map(([content, body]) => {
    const [first, ...rest] = [...content.agents];
    return {
      agents: new Map([[first[0], { ...first[1], templateText: body }], ...rest]),
    };
  });
}

/** Plugins content whose agents disagree on `provides`, with the distinct versions each side declares. */
export interface GeneratedDisagreeingPluginsContent extends GeneratedPluginsContent {
  /** The versions the agents declare, the first agent's before every other agent's, on different lines. */
  readonly provided: readonly [GeneratedMethodologyVersion, GeneratedMethodologyVersion];
}

/** Plugins content whose agents declare `provides` values on different lines. */
export function arbitraryDisagreeingPluginsContent(): fc.Arbitrary<GeneratedDisagreeingPluginsContent> {
  const agents = Object.keys(FETCH_CODING_AGENTS);
  return fc.tuple(arbitraryMethodologyVersion(), arbitraryMethodologyVersion())
    .filter(([first, second]) => first.line !== second.line)
    .chain(([first, second]) =>
      arbitraryMethodologyVersion().chain((templateVersion) =>
        fc.tuple(
          ...agents.map((_, index) =>
            arbitraryPluginContent(index === 0 ? first.text : second.text, templateVersion.text)
          ),
        )
          .map((contents) => ({
            agents: new Map(agents.map((agent, index) => [agent, contents[index]])),
            provided: [first, second] as const,
          }))
      )
    );
}

const COMPARATOR_JOINER = " ";

/** A `supports` range whose only member is the supplied version. */
export function supportsRangeContaining(version: string): string {
  return `${RANGE_COMPARATOR.EQUAL}${version}`;
}

/** A `supports` range admitting only versions above the supplied one, so the supplied version falls outside it. */
export function supportsRangeExcluding(version: string): string {
  return `${RANGE_COMPARATOR.GREATER}${version}`;
}

/** A comparator set whose lower and upper bounds both admit the supplied version. */
export function supportsRangeSpanning(version: string): string {
  return [
    `${RANGE_COMPARATOR.GREATER_OR_EQUAL}${version}`,
    `${RANGE_COMPARATOR.LESS_OR_EQUAL}${version}`,
  ].join(COMPARATOR_JOINER);
}

/** A comparator set whose upper bound excludes the supplied version its lower bound admits. */
export function supportsRangeSpanningBelow(version: string): string {
  return [
    `${RANGE_COMPARATOR.GREATER_OR_EQUAL}${version}`,
    `${RANGE_COMPARATOR.LESS}${version}`,
  ].join(COMPARATOR_JOINER);
}

/** Alternatives admitting the supplied version through the second branch alone. */
export function supportsRangeAlternatives(version: string): string {
  return [
    `${RANGE_COMPARATOR.LESS}${version}`,
    `${RANGE_COMPARATOR.EQUAL}${version}`,
  ].join(`${COMPARATOR_JOINER}${RANGE_ALTERNATIVE_SEPARATOR}${COMPARATOR_JOINER}`);
}

function generatedSourceTemplate(): MethodologySourceRecord["template"] {
  return {
    version: sampleGeneratedValue(arbitraryMethodologyVersion()).text,
    repository: sampleGeneratedValue(arbitraryPathSegment()),
    path: INSTRUCTION_TEMPLATE_RELATIVE_PATH,
    commit: sampleGeneratedValue(arbitraryPathSegment()),
  };
}

function generatedSourceMigration(codingAgent: string): MethodologySourceMigration {
  const directory = [METHODOLOGY_MIGRATION_ROOT, sampleGeneratedValue(arbitraryMethodologyLine()), codingAgent];
  const path = (fileName: string): string => [...directory, fileName].join(RESOURCE_ADDRESS_SEPARATOR);
  return {
    entries: [path(MIGRATION_ENTRY_FILE_NAME)],
    instructions: [path(`${sampleGeneratedValue(arbitraryPathSegment())}.md`)],
  };
}

function generatedSourcePlugins(
  plugin: (codingAgent: string) => MethodologySourceRecord["plugins"][string],
): MethodologySourceRecord["plugins"] {
  return Object.fromEntries(METHODOLOGY_CODING_AGENTS.map((codingAgent) => [codingAgent, plugin(codingAgent)]));
}

/** A source record naming one provider declaration, with an optional supports range, for every coding agent on a line. */
export function generatedSourceRecordProviding(provides: string, supports?: string): MethodologySourceRecord {
  return {
    repository: sampleGeneratedValue(arbitraryPathSegment()),
    revision: sampleGeneratedValue(arbitraryPathSegment()),
    template: generatedSourceTemplate(),
    plugins: generatedSourcePlugins((codingAgent) => ({
      name: FOUNDATION_PLUGIN_NAME,
      version: sampleGeneratedValue(arbitraryMethodologyVersion()).text,
      migration: generatedSourceMigration(codingAgent),
      provides,
      ...(supports === undefined ? {} : { supports }),
    })),
  };
}

/** A source record naming every coding agent's plugin at the supplied plugin version and declaring no provider block. */
export function generatedSourceRecordWithPluginVersion(pluginVersion: string): MethodologySourceRecord {
  return {
    repository: sampleGeneratedValue(arbitraryPathSegment()),
    revision: sampleGeneratedValue(arbitraryPathSegment()),
    template: generatedSourceTemplate(),
    plugins: generatedSourcePlugins((codingAgent) => ({
      name: FOUNDATION_PLUGIN_NAME,
      version: pluginVersion,
      migration: generatedSourceMigration(codingAgent),
    })),
  };
}
