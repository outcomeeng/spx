import { SESSION_ID_SEPARATOR } from "@/domains/session/timestamp";

/** The year every fixed session-identity instant carries. */
export const SESSION_IDENTITY_FIXTURE_YEAR = 2026;

/** A string no session id grammar admits. */
export const SESSION_IDENTITY_INVALID_TIMESTAMP = "not-a-timestamp";

export function utcFixtureInstant(month: number, day: number, hour: number, minute: number, second: number): Date {
  return new Date(Date.UTC(SESSION_IDENTITY_FIXTURE_YEAR, month, day, hour, minute, second));
}

/** The session id of an instant, composed from its ISO form independently of `generateSessionId`. */
export function expectedSessionId(instant: Date): string {
  const iso = instant.toISOString();
  return `${iso.slice(0, 10)}${SESSION_ID_SEPARATOR}${iso.slice(11, 19).replaceAll(":", "-")}`;
}
