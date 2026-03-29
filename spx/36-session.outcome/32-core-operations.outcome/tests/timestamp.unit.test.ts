/**
 * Unit tests for session timestamp generation and parsing.
 *
 * Test Level: 1 (Unit)
 * - Pure functions with DI (injected clock): generateSessionId, parseSessionId
 * - Property-based tests mandatory (parser roundtrip)
 *
 * Assertion covered from core-operations.md:
 * - P1: Timestamp generation produces lexicographically sortable IDs matching YYYY-MM-DD_HH-mm-ss
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { generateSessionId, parseSessionId, SESSION_ID_PATTERN, SESSION_ID_SEPARATOR } from "@/session/timestamp";

describe("generateSessionId", () => {
  it("GIVEN injected time WHEN generated THEN matches SESSION_ID_PATTERN", () => {
    const id = generateSessionId({
      now: () => new Date(2026, 0, 13, 8, 1, 5),
    });

    expect(id).toMatch(SESSION_ID_PATTERN);
    expect(id).toContain(SESSION_ID_SEPARATOR);
  });

  it("GIVEN single-digit components WHEN generated THEN zero-pads all fields", () => {
    const id = generateSessionId({
      now: () => new Date(2026, 0, 3, 5, 7, 9),
    });

    expect(id).toBe(`2026-01-03${SESSION_ID_SEPARATOR}05-07-09`);
  });

  it("GIVEN end-of-day time WHEN generated THEN handles 23:59:59", () => {
    const id = generateSessionId({
      now: () => new Date(2026, 11, 31, 23, 59, 59),
    });

    expect(id).toBe(`2026-12-31${SESSION_ID_SEPARATOR}23-59-59`);
  });
});

describe("parseSessionId", () => {
  it("GIVEN valid session ID WHEN parsed THEN returns Date with correct components", () => {
    const date = parseSessionId(`2026-01-13${SESSION_ID_SEPARATOR}08-01-05`);

    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(0); // January = 0
    expect(date!.getDate()).toBe(13);
    expect(date!.getHours()).toBe(8);
    expect(date!.getMinutes()).toBe(1);
    expect(date!.getSeconds()).toBe(5);
  });

  it("GIVEN invalid format WHEN parsed THEN returns null", () => {
    expect(parseSessionId("not-a-timestamp")).toBeNull();
    expect(parseSessionId("")).toBeNull();
    expect(parseSessionId("2026/01/13 08:01:05")).toBeNull();
  });

  it("GIVEN out-of-range month WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`2026-13-01${SESSION_ID_SEPARATOR}00-00-00`)).toBeNull();
    expect(parseSessionId(`2026-00-01${SESSION_ID_SEPARATOR}00-00-00`)).toBeNull();
  });

  it("GIVEN out-of-range hour WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`2026-01-01${SESSION_ID_SEPARATOR}24-00-00`)).toBeNull();
  });
});

describe("generateSessionId → parseSessionId roundtrip (property-based)", () => {
  it("GIVEN any valid Date WHEN generated then parsed THEN roundtrips correctly", () => {
    // Arbitrary for valid date components
    const validDate = fc.record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 0, max: 11 }),
      day: fc.integer({ min: 1, max: 28 }), // 28 to avoid month-length issues
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    });

    fc.assert(
      fc.property(validDate, ({ year, month, day, hour, minute, second }) => {
        const original = new Date(year, month, day, hour, minute, second);
        const id = generateSessionId({ now: () => original });
        const parsed = parseSessionId(id);

        expect(parsed).not.toBeNull();
        expect(parsed!.getFullYear()).toBe(year);
        expect(parsed!.getMonth()).toBe(month);
        expect(parsed!.getDate()).toBe(day);
        expect(parsed!.getHours()).toBe(hour);
        expect(parsed!.getMinutes()).toBe(minute);
        expect(parsed!.getSeconds()).toBe(second);
      }),
    );
  });

  it("GIVEN two different times WHEN generated THEN lexicographic order matches chronological order", () => {
    const validDate = fc.record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 0, max: 11 }),
      day: fc.integer({ min: 1, max: 28 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    });

    fc.assert(
      fc.property(validDate, validDate, (a, b) => {
        const dateA = new Date(a.year, a.month, a.day, a.hour, a.minute, a.second);
        const dateB = new Date(b.year, b.month, b.day, b.hour, b.minute, b.second);
        const idA = generateSessionId({ now: () => dateA });
        const idB = generateSessionId({ now: () => dateB });

        const chronological = dateA.getTime() - dateB.getTime();
        const lexicographic = idA.localeCompare(idB);

        // Same sign or both zero
        if (chronological < 0) expect(lexicographic).toBeLessThan(0);
        else if (chronological > 0) expect(lexicographic).toBeGreaterThan(0);
        else expect(lexicographic).toBe(0);
      }),
    );
  });
});
