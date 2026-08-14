import { SESSION_ID_SEPARATOR } from "@/domains/session/timestamp";

/** Fixture year the session-identity date builders anchor on. */
export const SESSION_IDENTITY_FIXTURE_YEAR = 2026;

/** A string that is not a parseable session identifier, for negative parse cases. */
export const SESSION_IDENTITY_INVALID_TIMESTAMP = "not-a-timestamp";

/** Builds a UTC instant in the fixture year from calendar components. */
export function utcFixtureInstant(
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  return new Date(Date.UTC(SESSION_IDENTITY_FIXTURE_YEAR, month, day, hour, minute, second));
}

/**
 * Derives the expected session identifier for an instant independently of the
 * production generator: this formats through `toISOString` and slicing, while
 * `generateSessionId` composes UTC component getters. Keeping the two
 * derivations distinct is what lets the comparison detect a defect in either.
 */
export function expectedSessionId(instant: Date): string {
  const iso = instant.toISOString();
  return `${iso.slice(0, 10)}${SESSION_ID_SEPARATOR}${iso.slice(11, 19).replaceAll(":", "-")}`;
}

/** Drops sub-second precision so instants compare at the granularity session IDs encode. */
export function truncateToSecond(instant: Date): number {
  return instant.getTime() - instant.getMilliseconds();
}
