/**
 * The CloudEvents v1.0 oracle for the journal's conformance evidence.
 *
 * The oracle is owned outside the journal module: the official CloudEvents JSON schema captured
 * verbatim from the `cloudevents/spec` release tag, interpreted by zod's JSON-schema reader, plus
 * the specversion value and attribute-naming rule quoted from the same release's specification
 * text. The harness resolves and reads those inert fixtures by path and hands the linked test the
 * oracle; the test owns every predicate over it.
 *
 * @module testing/harnesses/agent-run-journal/cloudevents-oracle
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { z } from "zod";

const CLOUDEVENTS_FIXTURE_ROOT = resolve(__dirname, "../../fixtures/cloudevents/v1.0.2");
const CAPTURE_MANIFEST_FILE = "capture.json";
const FIXTURE_ENCODING = "utf8";

const captureManifestSchema = z.object({
  schema: z.object({ file: z.string().min(1) }),
  specversion: z.object({ value: z.string().min(1) }),
  attributeNaming: z.object({ pattern: z.string().min(1) }),
});

const jsonSchemaDocumentSchema = z.object({
  properties: z.record(z.string(), z.unknown()),
});

export interface CloudEventsOracle {
  /** The captured official CloudEvents event schema, as a validator. */
  readonly eventSchema: z.ZodType;
  /** The context attribute names the captured schema declares; every other event attribute is an extension. */
  readonly contextAttributeNames: ReadonlySet<string>;
  /** The specversion value the captured release requires a producer to emit. */
  readonly specversion: string;
  /** The attribute-naming rule the captured release states, as a pattern. */
  readonly attributeNamePattern: RegExp;
}

async function readFixtureJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(join(CLOUDEVENTS_FIXTURE_ROOT, file), FIXTURE_ENCODING));
}

/** Load the captured CloudEvents release as an oracle independent of the journal module. */
export async function loadCloudEventsOracle(): Promise<CloudEventsOracle> {
  const manifest = captureManifestSchema.parse(await readFixtureJson(CAPTURE_MANIFEST_FILE));
  const schemaDocument = await readFixtureJson(manifest.schema.file);
  const { properties } = jsonSchemaDocumentSchema.parse(schemaDocument);
  return {
    eventSchema: z.fromJSONSchema(schemaDocument as Parameters<typeof z.fromJSONSchema>[0]),
    contextAttributeNames: new Set(Object.keys(properties)),
    specversion: manifest.specversion.value,
    attributeNamePattern: new RegExp(manifest.attributeNaming.pattern),
  };
}
