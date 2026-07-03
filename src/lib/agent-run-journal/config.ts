/**
 * Runtime config descriptor — the `runtime` section of `spx.config` carrying the
 * single reverse-DNS event-type namespace every CloudEvents `type` composes from.
 * The namespace root is declared once here as the descriptor default; journal run
 * and verify event types compose their `type` strings from it, so the root exists
 * in exactly one place rather than duplicated across each consumer's constants.
 *
 * @module lib/agent-run-journal/config
 */

import type { ConfigDescriptor, Result } from "@/config/types";

export const RUNTIME_SECTION = "runtime";

export const RUNTIME_CONFIG_FIELDS = {
  EVENT_NAMESPACE: "eventNamespace",
} as const;

/**
 * The default reverse-DNS event-type namespace — the reverse of the product
 * domain `spx.sh`. This is the sole declaration of the namespace root; every
 * CloudEvents `type` in the product composes from it.
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
