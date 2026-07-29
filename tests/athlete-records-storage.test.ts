import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ATHLETE_RECORDS_STORAGE_KEY,
  archiveAthleteEvent,
  correctPersonalRecord,
  createAthleteEvent,
  createPersonalRecord,
  getAthleteRecordsStore,
  normalizeAthleteRecordsStore,
  normalizeStoredAthleteEvent,
  normalizeStoredPersonalRecord,
  restoreAthleteEvent,
} from "../lib/athlete-records-storage";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

class TestWindow extends EventTarget {
  localStorage = new MemoryStorage();
}

const originalWindow = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);
const testWindow = new TestWindow();

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: testWindow,
});

beforeEach(() => {
  testWindow.localStorage.clear();
});

afterAll(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("athlete events and personal records storage", () => {
  it("normalizes untrusted local rows and drops unusable data", () => {
    expect(
      normalizeStoredAthleteEvent({
        id: "event-1",
        name: "  Lakeland 50  ",
        type: "fell_race",
        date: "2026-07-99",
        priority: "A",
      }),
    ).toBeNull();

    expect(
      normalizeStoredAthleteEvent({
        id: "event-1",
        name: "  Lakeland   50  ",
        type: "fell_race",
        date: "2026-07-25",
        priority: "A",
        distanceMeters: "80500",
        elevationGainMeters: -50,
        createdAt: "2026-01-01T10:00:00Z",
      }),
    ).toMatchObject({
      id: "event-1",
      name: "Lakeland 50",
      distanceMeters: 80_500,
      elevationGainMeters: undefined,
      source: "manual",
      revision: 1,
    });

    expect(
      normalizeStoredPersonalRecord({
        id: "record-1",
        kind: "running",
        date: "2026-06-03",
        distance: "5k",
        timeSeconds: -20,
      }),
    ).toBeNull();

    const normalized = normalizeAthleteRecordsStore({
      version: 99,
      events: [
        {
          id: "valid",
          name: "Local 10K",
          type: "10k",
          date: "2026-09-10",
          priority: "B",
        },
        { broken: true },
      ],
      personalRecords: "not-an-array",
    });

    expect(normalized.version).toBe(1);
    expect(normalized.events).toHaveLength(1);
    expect(normalized.personalRecords).toEqual([]);
  });

  it("edits and archives events without removing their prior state", () => {
    const created = createAthleteEvent({
      name: "Autumn race",
      type: "10k",
      date: "2026-10-04",
      priority: "B",
      goal: "Run evenly",
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const eventId = created.value.id;
    const rawAfterCreate = testWindow.localStorage.getItem(
      ATHLETE_RECORDS_STORAGE_KEY,
    );
    expect(rawAfterCreate).toContain("Autumn race");

    const archived = archiveAthleteEvent(eventId);
    expect(archived.ok).toBe(true);
    expect(getAthleteRecordsStore().events).toHaveLength(1);
    expect(getAthleteRecordsStore().events[0].archivedAt).not.toBeNull();

    const restored = restoreAthleteEvent(eventId);
    expect(restored.ok).toBe(true);

    const store = getAthleteRecordsStore();
    expect(store.events[0].archivedAt).toBeNull();
    expect(store.eventHistory.map((entry) => entry.reason)).toEqual(
      expect.arrayContaining(["created", "archived", "restored"]),
    );
  });

  it("retains the previous value when a personal record is corrected", () => {
    const created = createPersonalRecord({
      kind: "event",
      date: "2026-05-10",
      eventType: "hyrox",
      name: "HYROX London",
      timeSeconds: 4_800,
      placing: 42,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const corrected = correctPersonalRecord(created.value.id, {
      kind: "event",
      date: "2026-05-10",
      eventType: "hyrox",
      name: "HYROX London",
      timeSeconds: 4_740,
      placing: 39,
      notes: "Corrected from official results",
    });

    expect(corrected.ok).toBe(true);

    const store = getAthleteRecordsStore();
    const current = store.personalRecords[0];
    const previous = store.personalRecordHistory.find(
      (revision) => revision.reason === "corrected",
    );

    expect(current).toMatchObject({
      kind: "event",
      timeSeconds: 4_740,
      placing: 39,
      revision: 2,
    });
    expect(previous?.snapshot).toMatchObject({
      kind: "event",
      timeSeconds: 4_800,
      placing: 42,
    });
  });
});
