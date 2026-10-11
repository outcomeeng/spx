/** Loads the CloudEvents v1.0 attribute contract fixture — an oracle owned outside the journal producer. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONTRACT_FIXTURE_PATH = resolve(__dirname, "../../fixtures/agent-run-journal/cloudevents-v1.0-attributes.json");
const CONTRACT_FIXTURE_ENCODING = "utf8";

export interface CloudEventsAttributeContract {
  readonly specversion: string;
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly streamExtensions: readonly string[];
  readonly extensionNamePattern: string;
}

export function loadCloudEventsAttributeContract(): CloudEventsAttributeContract {
  return JSON.parse(readFileSync(CONTRACT_FIXTURE_PATH, CONTRACT_FIXTURE_ENCODING)) as CloudEventsAttributeContract;
}
