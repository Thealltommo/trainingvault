import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/cloud/migrate/route";
import { AUTH_COOKIE, createAuthToken } from "../lib/auth";
import {
  CLOUD_MIGRATION_KEY,
  CloudMigrationConflictError,
  CloudMigrationStorageError,
  buildCloudMigrationRows,
  cloudMigrationRequestSchema,
  executeCloudMigration,
  type CloudMigrationRepository,
  type CloudMigrationRow,
  type CloudMigrationTable,
  type DataMigrationRecord,
} from "../lib/cloud-migration";

const athleteId = "11111111-1111-4111-8111-111111111111";

function rawFixture() {
  const workout = {
    id: "threshold-run",
    title: "Threshold run",
    category: "track" as const,
    durationMinutes: 60,
    minimumMinutes: 30,
    intensity: "hard" as const,
    date: "2026-08-03",
    prescribedLoadsOrPace: "4:00-4:10/km",
    targetStimulus: "Controlled threshold",
    focus: ["threshold"],
    equipment: ["watch"],
    blocks: [
      {
        name: "Main set",
        type: "intervals" as const,
        durationMinutes: 40,
        items: ["4 x 6 minutes"],
      },
    ],
  };
  const manualWorkout = {
    id: "manual-strength",
    title: "Manual strength",
    category: "strength" as const,
    durationMinutes: 45,
    minimumMinutes: 20,
    intensity: "moderate" as const,
    date: "2026-08-05",
    focus: ["strength"],
    equipment: ["barbell"],
    blocks: [
      {
        name: "Main lifts",
        type: "strength" as const,
        durationMinutes: 45,
        items: ["Back squat"],
      },
    ],
  };

  return {
    snapshot: {
      version: 2 as const,
      programme: {
        id: "legacy-plan",
        name: "Legacy plan",
        description: "Migration fixture",
        durationWeeks: 1,
        startDate: "2026-08-03",
        weeks: [
          {
            id: "week-1",
            weekNumber: 1,
            title: "Build",
            days: [
              {
                id: "day-1",
                dayNumber: 1,
                label: "Monday",
                workout,
              },
            ],
          },
        ],
      },
      logs: [
        {
          id: "log-old",
          workoutId: "threshold-run",
          workoutTitle: "Threshold run",
          workoutCategory: "track" as const,
          workoutDate: "2026-08-03",
          completedAt: "2026-08-03T08:00:00.000Z",
          rpe: 6,
          actualDurationMinutes: 50,
          notes: "Earlier completion",
        },
        {
          id: "log-latest",
          workoutId: "threshold-run",
          workoutTitle: "Threshold run",
          workoutCategory: "track" as const,
          workoutDate: "2026-08-03",
          completedAt: "2026-08-03T18:00:00.000Z",
          rpe: 8,
          actualDurationMinutes: 44,
          notes: "Latest completion",
          blockResults: [
            {
              blockKey: "0-main-set",
              blockName: "Main set",
              status: "done" as const,
              result: "Complete",
            },
          ],
        },
      ],
      selectedTodayWorkoutId: "threshold-run",
      programmeAnchor: "2026-08-03",
      programmeStartDate: "2026-08-03",
      blockProgress: {
        "threshold-run": {
          workoutId: "threshold-run",
          updatedAt: "2026-08-03T18:00:00.000Z",
          blocks: { "0-main-set": "done" as const },
        },
      },
      blockResults: {
        "threshold-run": {
          "0-main-set": {
            blockKey: "0-main-set",
            blockName: "Main set",
            status: "done" as const,
            result: "Complete",
          },
        },
      },
      workoutOverrides: {
        "threshold-run": {
          workoutId: "threshold-run",
          durationMinutes: 45,
          modificationReason: "Heavy legs",
          updatedAt: "2026-08-02T20:00:00.000Z",
        },
      },
      exportedAt: "2026-08-06T09:00:00.000Z",
    },
    manualSessions: [
      {
        id: "manual-strength",
        type: "strength" as const,
        scheduledDate: "2026-08-05",
        originalWorkout: manualWorkout,
        variants: {
          full: {
            id: "full" as const,
            label: "Full",
            reason: "Normal prescription",
            prescription: manualWorkout,
          },
          adjusted: {
            id: "adjusted" as const,
            label: "Adjusted",
            reason: "Lower cost",
            prescription: {
              ...manualWorkout,
              durationMinutes: 35,
            },
          },
          minimum: {
            id: "minimum" as const,
            label: "Minimum",
            reason: "Smallest useful dose",
            prescription: {
              ...manualWorkout,
              durationMinutes: 20,
            },
          },
        },
        selectedVariant: "minimum" as const,
        createdAt: "2026-08-01T09:00:00.000Z",
        updatedAt: "2026-08-01T09:00:00.000Z",
      },
    ],
    lifecycle: {
      "manual-strength": {
        status: "skipped" as const,
        reason: "Travel",
        updatedAt: "2026-08-04T09:00:00.000Z",
      },
    },
  };
}

function fixture() {
  return cloudMigrationRequestSchema.parse(rawFixture());
}

class MemoryRepository implements CloudMigrationRepository {
  athleteRows = new Map<string, CloudMigrationRow>();
  migrationRows = new Map<string, DataMigrationRecord>();
  tableRows: Record<CloudMigrationTable, Map<string, CloudMigrationRow>> = {
    training_plans: new Map(),
    sessions: new Map(),
    session_blocks: new Map(),
    session_variants: new Map(),
    session_logs: new Map(),
  };
  writeCounts: Record<CloudMigrationTable, number> = {
    training_plans: 0,
    sessions: 0,
    session_blocks: 0,
    session_variants: 0,
    session_logs: 0,
  };
  failOn: CloudMigrationTable | null = null;

  async upsertAthlete(row: CloudMigrationRow) {
    if (!this.athleteRows.has(row.id)) {
      this.athleteRows.set(row.id, structuredClone(row));
    }
  }

  async claimMigration(row: DataMigrationRecord) {
    const key = `${row.athlete_id}:${row.migration_key}`;
    if (!this.migrationRows.has(key)) {
      this.migrationRows.set(key, structuredClone(row));
    }
  }

  async getMigration(athlete: string, migrationKey: string) {
    return (
      structuredClone(
        this.migrationRows.get(`${athlete}:${migrationKey}`),
      ) ?? null
    );
  }

  async updateMigration(row: DataMigrationRecord) {
    this.migrationRows.set(
      `${row.athlete_id}:${row.migration_key}`,
      structuredClone(row),
    );
  }

  async upsertRows(
    table: CloudMigrationTable,
    rows: CloudMigrationRow[],
  ) {
    this.writeCounts[table] += 1;
    if (this.failOn === table) {
      throw new CloudMigrationStorageError(table, "TEST_FAILURE");
    }
    for (const row of rows) {
      this.tableRows[table].set(row.id, structuredClone(row));
    }
  }
}

describe("cloud migration validation and mapping", () => {
  it("strictly rejects unknown fields and duplicate local IDs", () => {
    const unknownField = {
      ...rawFixture(),
      unexpected: true,
    };
    expect(
      cloudMigrationRequestSchema.safeParse(unknownField).success,
    ).toBe(false);

    const duplicateLogs = rawFixture();
    duplicateLogs.snapshot.logs[1].id =
      duplicateLogs.snapshot.logs[0].id;
    expect(
      cloudMigrationRequestSchema.safeParse(duplicateLogs).success,
    ).toBe(false);
  });

  it("preserves original, current, and completed data with stable IDs", () => {
    const input = fixture();
    const first = buildCloudMigrationRows(input, athleteId);
    const secondInput = fixture();
    secondInput.snapshot.exportedAt = "2026-09-01T12:00:00.000Z";
    const second = buildCloudMigrationRows(secondInput, athleteId);

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.plans.map((row) => row.id)).toEqual(
      first.plans.map((row) => row.id),
    );
    expect(second.sessions.map((row) => row.id)).toEqual(
      first.sessions.map((row) => row.id),
    );
    expect(first.logs).toHaveLength(2);
    expect(first.sessions).toHaveLength(3);

    const planned = first.sessions.find(
      (row) => row.source_id?.toString().startsWith("programme:"),
    );
    expect(
      (planned?.original_prescription as { durationMinutes: number })
        .durationMinutes,
    ).toBe(60);
    expect(
      (planned?.current_prescription as { durationMinutes: number })
        .durationMinutes,
    ).toBe(45);
    expect(
      (
        planned?.completed_result as {
          log: { id: string };
        }
      ).log.id,
    ).toBe("log-latest");
    expect(planned?.source).toBe("local_storage");
    expect(planned?.legacy_id).toBe("threshold-run");

    const recovered = first.sessions.find((row) =>
      row.source_id?.toString().startsWith("recovered-log-session:"),
    );
    expect(
      (
        recovered?.completed_result as {
          log: { id: string };
        }
      ).log.id,
    ).toBe("log-old");
  });
});

describe("cloud migration execution semantics", () => {
  it("is idempotent and skips all row writes after exact completion", async () => {
    const repository = new MemoryRepository();
    const input = fixture();
    const now = () => new Date("2026-08-06T10:00:00.000Z");

    const first = await executeCloudMigration(input, {
      athleteId,
      repository,
      now,
    });
    const sizes = Object.fromEntries(
      Object.entries(repository.tableRows).map(([table, rows]) => [
        table,
        rows.size,
      ]),
    );
    const writeCounts = { ...repository.writeCounts };
    const second = await executeCloudMigration(input, {
      athleteId,
      repository,
      now,
    });

    expect(first.alreadyMigrated).toBe(false);
    expect(second.alreadyMigrated).toBe(true);
    expect(repository.writeCounts).toEqual(writeCounts);
    expect(
      Object.fromEntries(
        Object.entries(repository.tableRows).map(([table, rows]) => [
          table,
          rows.size,
        ]),
      ),
    ).toEqual(sizes);
    expect(
      repository.migrationRows.get(
        `${athleteId}:${CLOUD_MIGRATION_KEY}`,
      )?.status,
    ).toBe("completed");
  });

  it("rejects a different snapshot after the one-time claim", async () => {
    const repository = new MemoryRepository();
    await executeCloudMigration(fixture(), {
      athleteId,
      repository,
    });
    const changed = fixture();
    if (changed.snapshot.programme) {
      changed.snapshot.programme.name = "Changed local plan";
    }

    await expect(
      executeCloudMigration(changed, { athleteId, repository }),
    ).rejects.toBeInstanceOf(CloudMigrationConflictError);
  });

  it("records partial failure and safely resumes the same snapshot", async () => {
    const repository = new MemoryRepository();
    const input = fixture();
    repository.failOn = "sessions";

    await expect(
      executeCloudMigration(input, { athleteId, repository }),
    ).rejects.toBeInstanceOf(CloudMigrationStorageError);
    expect(
      repository.migrationRows.get(
        `${athleteId}:${CLOUD_MIGRATION_KEY}`,
      )?.status,
    ).toBe("failed");

    repository.failOn = null;
    const result = await executeCloudMigration(input, {
      athleteId,
      repository,
    });
    const expected = buildCloudMigrationRows(input, athleteId);

    expect(result.alreadyMigrated).toBe(false);
    expect(repository.tableRows.training_plans.size).toBe(
      expected.plans.length,
    );
    expect(repository.tableRows.sessions.size).toBe(
      expected.sessions.length,
    );
    expect(repository.tableRows.session_logs.size).toBe(
      expected.logs.length,
    );
    expect(
      repository.migrationRows.get(
        `${athleteId}:${CLOUD_MIGRATION_KEY}`,
      )?.status,
    ).toBe("completed");
  });
});

describe("cloud migration route boundary", () => {
  const originalSessionSecret = process.env.TRAINVAULT_SESSION_SECRET;
  const originalAthleteId = process.env.TRAINVAULT_ATHLETE_ID;

  beforeEach(() => {
    process.env.TRAINVAULT_SESSION_SECRET =
      "cloud-migration-route-test-secret";
    delete process.env.TRAINVAULT_ATHLETE_ID;
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.TRAINVAULT_SESSION_SECRET;
    } else {
      process.env.TRAINVAULT_SESSION_SECRET = originalSessionSecret;
    }

    if (originalAthleteId === undefined) {
      delete process.env.TRAINVAULT_ATHLETE_ID;
    } else {
      process.env.TRAINVAULT_ATHLETE_ID = originalAthleteId;
    }
  });

  it("requires a signed TrainVault session", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/cloud/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rawFixture()),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns a safe configuration response before opening Supabase", async () => {
    const token = await createAuthToken();
    const response = await POST(
      new NextRequest("http://localhost/api/cloud/migrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${AUTH_COOKIE}=${token}`,
        },
        body: JSON.stringify(rawFixture()),
      }),
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(payload.error).toContain("TRAINVAULT_ATHLETE_ID");
    expect(payload.error).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
