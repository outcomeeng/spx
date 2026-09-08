/**
 * Generators for the methodology-tree domain: exact methodology versions with
 * their structural parts, text that is not a version, coding-agent names, and
 * the content a plugins repository publishes per coding agent.
 *
 * Expected values derive from the generated structure — a version's line is its
 * major and minor parts — so a test never recomputes the parse it verifies.
 *
 * @module generators/methodology/tree
 */

import * as fc from "fast-check";

import { FETCH_CODING_AGENTS, UNDERSTAND_SKILL_RELATIVE_DIR } from "@/lib/methodology/fetch";
import {
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
} from "@/lib/methodology/foundation-manifest";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";

const VERSION_COMPONENT_MAX = 999;
const VERSION_SEPARATOR = ".";
const PRERELEASE_SEPARATOR = "-";
const LINE_COMPONENT_COUNT = 2;

/** An exact methodology version with the parts the line derives from. */
export interface GeneratedMethodologyVersion {
  readonly text: string;
  readonly line: string;
}

function versionComponent(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: VERSION_COMPONENT_MAX });
}

/** An exact `MAJOR.MINOR.PATCH` version, optionally carrying a prerelease suffix. */
export function arbitraryMethodologyVersion(): fc.Arbitrary<GeneratedMethodologyVersion> {
  return fc.tuple(
    versionComponent(),
    versionComponent(),
    versionComponent(),
    fc.option(arbitraryPathSegment(), { nil: undefined }),
  ).map(([major, minor, patch, prerelease]) => {
    const line = [major, minor].join(VERSION_SEPARATOR);
    const exact = [major, minor, patch].join(VERSION_SEPARATOR);
    return {
      text: prerelease === undefined ? exact : `${exact}${PRERELEASE_SEPARATOR}${prerelease}`,
      line,
    };
  });
}

/** A `MAJOR.MINOR` line on its own, the shape a fetch argument names. */
export function arbitraryMethodologyLine(): fc.Arbitrary<string> {
  return fc.tuple(versionComponent(), versionComponent()).map((parts) => parts.join(VERSION_SEPARATOR));
}

/** Text that is not an exact methodology version: too few components, a bare line, words, or empty. */
export function arbitraryNonVersionText(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(""),
    arbitraryMethodologyLine(),
    arbitraryPathSegment(),
    fc.tuple(versionComponent(), arbitraryPathSegment()).map((parts) => parts.join(VERSION_SEPARATOR)),
    fc.array(versionComponent(), { minLength: LINE_COMPONENT_COUNT + 2, maxLength: LINE_COMPONENT_COUNT + 3 })
      .map((parts) => parts.join(VERSION_SEPARATOR)),
  );
}

/** A coding-agent directory name: one plain lowercase path segment. */
export function arbitraryCodingAgentName(): fc.Arbitrary<string> {
  return arbitraryPathSegment();
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
  return fc.tuple(arbitraryPathSegment(), arbitraryMarkdownBody(), arbitraryMarkdownBody(), arbitraryMarkdownBody(), arbitraryMarkdownBody())
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
export function arbitraryPluginContent(provides?: string): fc.Arbitrary<GeneratedPluginContent> {
  return fc.tuple(arbitraryPathSegment(), arbitraryMethodologyVersion(), skillFiles(), arbitraryMethodologyLine())
    .map(([pluginName, pluginVersion, files, supportsLine]) => ({
      pluginName,
      pluginVersion: pluginVersion.text,
      ...(provides === undefined ? {} : { provides, supports: `>=${supportsLine}` }),
      skillFiles: files,
    }));
}

/** Plugins content for every fetched coding agent, all declaring the same `provides` when one is supplied. */
export function arbitraryPluginsContent(provides?: string): fc.Arbitrary<GeneratedPluginsContent> {
  const agents = Object.keys(FETCH_CODING_AGENTS);
  return fc.tuple(...agents.map(() => arbitraryPluginContent(provides))).map((contents) => ({
    agents: new Map(agents.map((agent, index) => [agent, contents[index] as GeneratedPluginContent])),
  }));
}

/** Plugins content whose agents declare different `provides` values. */
export function arbitraryDisagreeingPluginsContent(): fc.Arbitrary<GeneratedPluginsContent> {
  const agents = Object.keys(FETCH_CODING_AGENTS);
  return fc.tuple(arbitraryMethodologyVersion(), arbitraryMethodologyVersion())
    .filter(([first, second]) => first.text !== second.text)
    .chain(([first, second]) =>
      fc.tuple(...agents.map((_, index) => arbitraryPluginContent(index === 0 ? first.text : second.text)))
    )
    .map((contents) => ({
      agents: new Map(agents.map((agent, index) => [agent, contents[index] as GeneratedPluginContent])),
    }));
}
