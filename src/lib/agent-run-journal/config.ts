/**
 * Runtime config descriptor — declares the reverse-DNS event-type namespace root
 * once as the `eventNamespace` default of the `runtime` config section. Journal
 * run and verify event types compose their CloudEvents `type` from this single
 * default declaration rather than each restating the root, so the namespace lives
 * in one place. Registering the section makes the value a typed, validated config
 * field; the event-type constants compose from the compile-time default and do not
 * yet consume a config-file override.
 *
 * @module lib/agent-run-journal/config
 */

import type { ConfigDescriptor, Result } from "@/config/types";

export const RUNTIME_SECTION = "runtime";

export const RUNTIME_CONFIG_FIELDS = {
  EVENT_NAMESPACE: "eventNamespace",
} as const;

/**
 * The default reverse-DNS event-type namespace root — the reverse of the product
 * domain `spx.sh`. The sole declaration of the root; journal run and verify event
 * types compose their CloudEvents `type` from this default.
 */
export const RUNTIME_EVENT_NAMESPACE_DEFAULT = "sh.spx";

/** The resolved `runtime` section: the reverse-DNS event-type namespace root. */
export interface RuntimeConfig {
  readonly eventNamespace: string;
}

const defaults: RuntimeConfig = { eventNamespace: RUNTIME_EVENT_NAMESPACE_DEFAULT };

function validate(value: unknown): Result<RuntimeConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${RUNTIME_SECTION} section must be an object` };
  }
  const candidate = value as Record<string, unknown>;
  const raw = candidate[RUNTIME_CONFIG_FIELDS.EVENT_NAMESPACE];
  if (raw === undefined) {
    return { ok: true, value: { eventNamespace: RUNTIME_EVENT_NAMESPACE_DEFAULT } };
  }
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      ok: false,
      error: `${RUNTIME_SECTION}.${RUNTIME_CONFIG_FIELDS.EVENT_NAMESPACE} must be a non-empty string`,
    };
  }
  return { ok: true, value: { eventNamespace: raw } };
}

export const runtimeConfigDescriptor: ConfigDescriptor<RuntimeConfig> = {
  section: RUNTIME_SECTION,
  defaults,
  validate,
};
