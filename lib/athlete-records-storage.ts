"use client";

import { useSyncExternalStore } from "react";
import type {
  AthleteEvent,
  AthleteEventType,
  PersonalRecord,
} from "@/lib/athlete";

export const ATHLETE_RECORDS_STORAGE_KEY =
  "trainvault_athlete_records_v1";

const ATHLETE_RECORDS_CHANGE_EVENT =
  "trainvault:athlete-records-change";
const STORAGE_CHANGE_EVENT = "trainvault:storage-change";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_TYPES: AthleteEventType[] = [
  "5k",
  "10k",
  "half_marathon",
  "marathon",
  "crossfit_competition",
  "hyrox",
  "spartan_sprint",
  "spartan_super",
  "spartan_beast",
  "spartan_weekend",
  "fell_race",
  "custom",
];
const RUNNING_DISTANCES = [
  "1k",
  "1_mile",
  "5k",
  "10k",
  "half_marathon",
] as const;

type WithoutId<T> = T extends { id: string } ? Omit<T, "id"> : never;

export type AthleteEventDraft = Omit<AthleteEvent, "id">;
export type PersonalRecordDraft = WithoutId<PersonalRecord>;
export type AthleteRecordSource = "manual";
export type RevisionReason =
  | "created"
  | "corrected"
  | "archived"
  | "restored";

export type RecordMetadata = {
  source: AthleteRecordSource;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  revision: number;
};

export type StoredAthleteEvent = AthleteEvent & RecordMetadata;
export type StoredPersonalRecord = PersonalRecord & RecordMetadata;

export type AthleteEventRevision = {
  id: string;
  eventId: string;
  changedAt: string;
  reason: RevisionReason;
  snapshot: AthleteEvent;
};

export type PersonalRecordRevision = {
  id: string;
  recordId: string;
  changedAt: string;
  reason: RevisionReason;
  snapshot: PersonalRecord;
};

export type AthleteRecordsStore = {
  version: 1;
  events: StoredAthleteEvent[];
  personalRecords: StoredPersonalRecord[];
  eventHistory: AthleteEventRevision[];
  personalRecordHistory: PersonalRecordRevision[];
  updatedAt: string | null;
};

export type StorageMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const EMPTY_STORE: AthleteRecordsStore = {
  version: 1,
  events: [],
  personalRecords: [],
  eventHistory: [],
  personalRecordHistory: [],
  updatedAt: null,
};

let cachedRaw: string | null | undefined;
let cachedStore = EMPTY_STORE;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanRequiredText(value: unknown, maximumLength = 120) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function cleanOptionalText(value: unknown, maximumLength = 1_000) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maximumLength) : undefined;
}

function cleanId(value: unknown) {
  return cleanRequiredText(value, 160);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function validDateTime(value: unknown) {
  if (
    typeof value !== "string" ||
    Number.isNaN(new Date(value).getTime())
  ) {
    return null;
  }

  return new Date(value).toISOString();
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (parsed < minimum || parsed > maximum) {
    return undefined;
  }

  return integer ? Math.round(parsed) : Math.round(parsed * 100) / 100;
}

function toBaseEvent(value: unknown): AthleteEvent | null {
  if (!isObject(value)) return null;

  const id = cleanId(value.id);
  const name = cleanRequiredText(value.name);
  const type = EVENT_TYPES.includes(value.type as AthleteEventType)
    ? (value.type as AthleteEventType)
    : null;
  const priority =
    value.priority === "A" ||
    value.priority === "B" ||
    value.priority === "C"
      ? value.priority
      : null;

  if (!id || !name || !type || !validDate(value.date) || !priority) {
    return null;
  }

  return {
    id,
    athleteId: cleanOptionalText(value.athleteId, 160),
    name,
    type,
    date: value.date,
    priority,
    location: cleanOptionalText(value.location, 180),
    distanceMeters: finiteNumber(
      value.distanceMeters,
      1,
      1_000_000,
      true,
    ),
    elevationGainMeters: finiteNumber(
      value.elevationGainMeters,
      0,
      100_000,
      true,
    ),
    goal: cleanOptionalText(value.goal, 500),
    notes: cleanOptionalText(value.notes, 2_000),
  };
}

function toBasePersonalRecord(value: unknown): PersonalRecord | null {
  if (!isObject(value)) return null;

  const id = cleanId(value.id);

  if (!id || !validDate(value.date)) return null;

  if (value.kind === "running") {
    const distance = RUNNING_DISTANCES.includes(
      value.distance as (typeof RUNNING_DISTANCES)[number],
    )
      ? (value.distance as (typeof RUNNING_DISTANCES)[number])
      : null;
    const timeSeconds = finiteNumber(
      value.timeSeconds,
      1,
      7 * 86_400,
      true,
    );

    if (!distance || timeSeconds === undefined) return null;

    return {
      id,
      kind: "running",
      date: value.date,
      distance,
      timeSeconds,
      sourceActivityId: cleanOptionalText(value.sourceActivityId, 160),
      notes: cleanOptionalText(value.notes, 2_000),
    };
  }

  if (value.kind === "strength") {
    const movement = cleanRequiredText(value.movement);
    const load = finiteNumber(value.load, 0, 10_000);
    const reps = finiteNumber(value.reps, 1, 10_000, true);
    const unit =
      value.unit === "kg" || value.unit === "lb" ? value.unit : null;

    if (!movement || load === undefined || reps === undefined || !unit) {
      return null;
    }

    return {
      id,
      kind: "strength",
      date: value.date,
      movement,
      load,
      unit,
      reps,
      notes: cleanOptionalText(value.notes, 2_000),
    };
  }

  if (value.kind === "benchmark") {
    const name = cleanRequiredText(value.name);
    const score = cleanRequiredText(value.score, 240);

    if (!name || !score) return null;

    return {
      id,
      kind: "benchmark",
      date: value.date,
      name,
      score,
      timeSeconds: finiteNumber(
        value.timeSeconds,
        1,
        7 * 86_400,
        true,
      ),
      notes: cleanOptionalText(value.notes, 2_000),
    };
  }

  if (value.kind === "event") {
    const name = cleanRequiredText(value.name);
    const eventType = EVENT_TYPES.includes(
      value.eventType as AthleteEventType,
    )
      ? (value.eventType as AthleteEventType)
      : null;

    if (!name || !eventType) return null;

    return {
      id,
      kind: "event",
      date: value.date,
      eventType,
      name,
      timeSeconds: finiteNumber(
        value.timeSeconds,
        1,
        7 * 86_400,
        true,
      ),
      placing: finiteNumber(value.placing, 1, 1_000_000, true),
      notes: cleanOptionalText(value.notes, 2_000),
    };
  }

  return null;
}

function metadataFrom(
  value: Record<string, unknown>,
  fallbackDateTime: string,
): RecordMetadata {
  const createdAt = validDateTime(value.createdAt) ?? fallbackDateTime;
  const updatedAt = validDateTime(value.updatedAt) ?? createdAt;
  const archivedAt = validDateTime(value.archivedAt);

  return {
    source: "manual",
    createdAt,
    updatedAt,
    archivedAt,
    revision: finiteNumber(value.revision, 1, 1_000_000, true) ?? 1,
  };
}

export function normalizeStoredAthleteEvent(
  value: unknown,
  fallbackDateTime = new Date(0).toISOString(),
): StoredAthleteEvent | null {
  const event = toBaseEvent(value);
  return event && isObject(value)
    ? { ...event, ...metadataFrom(value, fallbackDateTime) }
    : null;
}

export function normalizeStoredPersonalRecord(
  value: unknown,
  fallbackDateTime = new Date(0).toISOString(),
): StoredPersonalRecord | null {
  const record = toBasePersonalRecord(value);
  return record && isObject(value)
    ? { ...record, ...metadataFrom(value, fallbackDateTime) }
    : null;
}

function eventSnapshot(value: StoredAthleteEvent): AthleteEvent {
  return {
    id: value.id,
    athleteId: value.athleteId,
    name: value.name,
    type: value.type,
    date: value.date,
    priority: value.priority,
    location: value.location,
    distanceMeters: value.distanceMeters,
    elevationGainMeters: value.elevationGainMeters,
    goal: value.goal,
    notes: value.notes,
  };
}

function personalRecordSnapshot(
  value: StoredPersonalRecord,
): PersonalRecord {
  if (value.kind === "running") {
    return {
      id: value.id,
      kind: "running",
      date: value.date,
      distance: value.distance,
      timeSeconds: value.timeSeconds,
      sourceActivityId: value.sourceActivityId,
      notes: value.notes,
    };
  }

  if (value.kind === "strength") {
    return {
      id: value.id,
      kind: "strength",
      date: value.date,
      movement: value.movement,
      load: value.load,
      unit: value.unit,
      reps: value.reps,
      notes: value.notes,
    };
  }

  if (value.kind === "benchmark") {
    return {
      id: value.id,
      kind: "benchmark",
      date: value.date,
      name: value.name,
      score: value.score,
      timeSeconds: value.timeSeconds,
      notes: value.notes,
    };
  }

  return {
    id: value.id,
    kind: "event",
    date: value.date,
    eventType: value.eventType,
    name: value.name,
    timeSeconds: value.timeSeconds,
    placing: value.placing,
    notes: value.notes,
  };
}

function normalizeEventRevision(
  value: unknown,
): AthleteEventRevision | null {
  if (!isObject(value)) return null;

  const id = cleanId(value.id);
  const eventId = cleanId(value.eventId);
  const changedAt = validDateTime(value.changedAt);
  const snapshot = toBaseEvent(value.snapshot);
  const reason =
    value.reason === "created" ||
    value.reason === "corrected" ||
    value.reason === "archived" ||
    value.reason === "restored"
      ? value.reason
      : null;

  return id && eventId && changedAt && snapshot && reason
    ? { id, eventId, changedAt, reason, snapshot }
    : null;
}

function normalizePersonalRecordRevision(
  value: unknown,
): PersonalRecordRevision | null {
  if (!isObject(value)) return null;

  const id = cleanId(value.id);
  const recordId = cleanId(value.recordId);
  const changedAt = validDateTime(value.changedAt);
  const snapshot = toBasePersonalRecord(value.snapshot);
  const reason =
    value.reason === "created" ||
    value.reason === "corrected" ||
    value.reason === "archived" ||
    value.reason === "restored"
      ? value.reason
      : null;

  return id && recordId && changedAt && snapshot && reason
    ? { id, recordId, changedAt, reason, snapshot }
    : null;
}

export function normalizeAthleteRecordsStore(
  value: unknown,
): AthleteRecordsStore {
  if (!isObject(value)) return EMPTY_STORE;

  const events = Array.isArray(value.events)
    ? value.events
        .map((event) => normalizeStoredAthleteEvent(event))
        .filter(
          (event): event is StoredAthleteEvent => event !== null,
        )
    : [];
  const personalRecords = Array.isArray(value.personalRecords)
    ? value.personalRecords
        .map((record) => normalizeStoredPersonalRecord(record))
        .filter(
          (record): record is StoredPersonalRecord => record !== null,
        )
    : [];
  const eventHistory = Array.isArray(value.eventHistory)
    ? value.eventHistory
        .map(normalizeEventRevision)
        .filter(
          (revision): revision is AthleteEventRevision =>
            revision !== null,
        )
    : [];
  const personalRecordHistory = Array.isArray(
    value.personalRecordHistory,
  )
    ? value.personalRecordHistory
        .map(normalizePersonalRecordRevision)
        .filter(
          (revision): revision is PersonalRecordRevision =>
            revision !== null,
        )
    : [];

  return {
    version: 1,
    events: events.sort((first, second) =>
      first.date.localeCompare(second.date),
    ),
    personalRecords: personalRecords.sort((first, second) =>
      second.date.localeCompare(first.date),
    ),
    eventHistory: eventHistory.sort((first, second) =>
      second.changedAt.localeCompare(first.changedAt),
    ),
    personalRecordHistory: personalRecordHistory.sort(
      (first, second) =>
        second.changedAt.localeCompare(first.changedAt),
    ),
    updatedAt: validDateTime(value.updatedAt),
  };
}

function canUseStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function subscribe(callback: () => void) {
  if (!canUseStorage()) return () => {};

  window.addEventListener(ATHLETE_RECORDS_CHANGE_EVENT, callback);
  window.addEventListener(STORAGE_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(ATHLETE_RECORDS_CHANGE_EVENT, callback);
    window.removeEventListener(STORAGE_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function getAthleteRecordsStore() {
  if (!canUseStorage()) return EMPTY_STORE;

  let raw: string | null;

  try {
    raw = window.localStorage.getItem(ATHLETE_RECORDS_STORAGE_KEY);
  } catch {
    return EMPTY_STORE;
  }

  if (raw === cachedRaw) return cachedStore;

  try {
    cachedStore = raw
      ? normalizeAthleteRecordsStore(JSON.parse(raw) as unknown)
      : EMPTY_STORE;
  } catch {
    cachedStore = EMPTY_STORE;
  }

  cachedRaw = raw;
  return cachedStore;
}

export function useAthleteRecordsStore() {
  return useSyncExternalStore(
    subscribe,
    getAthleteRecordsStore,
    () => EMPTY_STORE,
  );
}

function writeStore(
  store: AthleteRecordsStore,
): StorageMutationResult<AthleteRecordsStore> {
  if (!canUseStorage()) {
    return {
      ok: false,
      error: "Browser storage is unavailable. No changes were saved.",
    };
  }

  const normalized = normalizeAthleteRecordsStore(store);
  const raw = JSON.stringify(normalized);

  try {
    window.localStorage.setItem(ATHLETE_RECORDS_STORAGE_KEY, raw);
    cachedRaw = raw;
    cachedStore = normalized;
    window.dispatchEvent(new Event(ATHLETE_RECORDS_CHANGE_EVENT));
    return { ok: true, value: normalized };
  } catch {
    return {
      ok: false,
      error:
        "TrainVault could not write to browser storage. Existing data was left untouched.",
    };
  }
}

function createId(prefix: string) {
  const uuid =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}

function eventFromDraft(
  id: string,
  draft: AthleteEventDraft,
): AthleteEvent | null {
  return toBaseEvent({ ...draft, id });
}

function recordFromDraft(
  id: string,
  draft: PersonalRecordDraft,
): PersonalRecord | null {
  return toBasePersonalRecord({ ...draft, id });
}

export function createAthleteEvent(
  draft: AthleteEventDraft,
): StorageMutationResult<StoredAthleteEvent> {
  const changedAt = new Date().toISOString();
  const event = eventFromDraft(createId("event"), draft);

  if (!event) {
    return { ok: false, error: "Check the required event fields." };
  }

  const stored: StoredAthleteEvent = {
    ...event,
    source: "manual",
    createdAt: changedAt,
    updatedAt: changedAt,
    archivedAt: null,
    revision: 1,
  };
  const current = getAthleteRecordsStore();
  const result = writeStore({
    ...current,
    events: [...current.events, stored],
    eventHistory: [
      {
        id: createId("event_revision"),
        eventId: stored.id,
        changedAt,
        reason: "created",
        snapshot: eventSnapshot(stored),
      },
      ...current.eventHistory,
    ],
    updatedAt: changedAt,
  });

  return result.ok ? { ok: true, value: stored } : result;
}

export function updateAthleteEvent(
  id: string,
  draft: AthleteEventDraft,
): StorageMutationResult<StoredAthleteEvent> {
  const current = getAthleteRecordsStore();
  const existing = current.events.find((event) => event.id === id);

  if (!existing) {
    return { ok: false, error: "That event no longer exists." };
  }

  const changedAt = new Date().toISOString();
  const event = eventFromDraft(existing.id, draft);

  if (!event) {
    return { ok: false, error: "Check the required event fields." };
  }

  const updated: StoredAthleteEvent = {
    ...event,
    source: "manual",
    createdAt: existing.createdAt,
    updatedAt: changedAt,
    archivedAt: existing.archivedAt,
    revision: existing.revision + 1,
  };
  const result = writeStore({
    ...current,
    events: current.events.map((item) =>
      item.id === id ? updated : item,
    ),
    eventHistory: [
      {
        id: createId("event_revision"),
        eventId: id,
        changedAt,
        reason: "corrected",
        snapshot: eventSnapshot(existing),
      },
      ...current.eventHistory,
    ],
    updatedAt: changedAt,
  });

  return result.ok ? { ok: true, value: updated } : result;
}

function setAthleteEventArchiveState(
  id: string,
  archived: boolean,
): StorageMutationResult<StoredAthleteEvent> {
  const current = getAthleteRecordsStore();
  const existing = current.events.find((event) => event.id === id);

  if (!existing) {
    return { ok: false, error: "That event no longer exists." };
  }

  const changedAt = new Date().toISOString();
  const updated: StoredAthleteEvent = {
    ...existing,
    archivedAt: archived ? changedAt : null,
    updatedAt: changedAt,
    revision: existing.revision + 1,
  };
  const result = writeStore({
    ...current,
    events: current.events.map((event) =>
      event.id === id ? updated : event,
    ),
    eventHistory: [
      {
        id: createId("event_revision"),
        eventId: id,
        changedAt,
        reason: archived ? "archived" : "restored",
        snapshot: eventSnapshot(existing),
      },
      ...current.eventHistory,
    ],
    updatedAt: changedAt,
  });

  return result.ok ? { ok: true, value: updated } : result;
}

export function archiveAthleteEvent(id: string) {
  return setAthleteEventArchiveState(id, true);
}

export function restoreAthleteEvent(id: string) {
  return setAthleteEventArchiveState(id, false);
}

export function createPersonalRecord(
  draft: PersonalRecordDraft,
): StorageMutationResult<StoredPersonalRecord> {
  const changedAt = new Date().toISOString();
  const record = recordFromDraft(createId("record"), draft);

  if (!record) {
    return { ok: false, error: "Check the required record fields." };
  }

  const stored: StoredPersonalRecord = {
    ...record,
    source: "manual",
    createdAt: changedAt,
    updatedAt: changedAt,
    archivedAt: null,
    revision: 1,
  };
  const current = getAthleteRecordsStore();
  const result = writeStore({
    ...current,
    personalRecords: [stored, ...current.personalRecords],
    personalRecordHistory: [
      {
        id: createId("record_revision"),
        recordId: stored.id,
        changedAt,
        reason: "created",
        snapshot: personalRecordSnapshot(stored),
      },
      ...current.personalRecordHistory,
    ],
    updatedAt: changedAt,
  });

  return result.ok ? { ok: true, value: stored } : result;
}

export function correctPersonalRecord(
  id: string,
  draft: PersonalRecordDraft,
): StorageMutationResult<StoredPersonalRecord> {
  const current = getAthleteRecordsStore();
  const existing = current.personalRecords.find(
    (record) => record.id === id,
  );

  if (!existing) {
    return { ok: false, error: "That record no longer exists." };
  }

  const changedAt = new Date().toISOString();
  const record = recordFromDraft(existing.id, draft);

  if (!record) {
    return { ok: false, error: "Check the required record fields." };
  }

  const updated: StoredPersonalRecord = {
    ...record,
    source: "manual",
    createdAt: existing.createdAt,
    updatedAt: changedAt,
    archivedAt: existing.archivedAt,
    revision: existing.revision + 1,
  };
  const result = writeStore({
    ...current,
    personalRecords: current.personalRecords.map((item) =>
      item.id === id ? updated : item,
    ),
    personalRecordHistory: [
      {
        id: createId("record_revision"),
        recordId: id,
        changedAt,
        reason: "corrected",
        snapshot: personalRecordSnapshot(existing),
      },
      ...current.personalRecordHistory,
    ],
    updatedAt: changedAt,
  });

  return result.ok ? { ok: true, value: updated } : result;
}

function setPersonalRecordArchiveState(
  id: string,
  archived: boolean,
): StorageMutationResult<StoredPersonalRecord> {
  const current = getAthleteRecordsStore();
  const existing = current.personalRecords.find(
    (record) => record.id === id,
  );

  if (!existing) {
    return { ok: false, error: "That record no longer exists." };
  }

  const changedAt = new Date().toISOString();
  const updated: StoredPersonalRecord = {
    ...existing,
    archivedAt: archived ? changedAt : null,
    updatedAt: changedAt,
    revision: existing.revision + 1,
  };
  const result = writeStore({
    ...current,
    personalRecords: current.personalRecords.map((record) =>
      record.id === id ? updated : record,
    ),
    personalRecordHistory: [
      {
        id: createId("record_revision"),
        recordId: id,
        changedAt,
        reason: archived ? "archived" : "restored",
        snapshot: personalRecordSnapshot(existing),
      },
      ...current.personalRecordHistory,
    ],
    updatedAt: changedAt,
  });

  return result.ok ? { ok: true, value: updated } : result;
}

export function archivePersonalRecord(id: string) {
  return setPersonalRecordArchiveState(id, true);
}

export function restorePersonalRecord(id: string) {
  return setPersonalRecordArchiveState(id, false);
}
