"use client";

import { useEffect, useRef, useState } from "react";
import { CloudDownload, ShieldCheck, X } from "lucide-react";
import {
  getTrainVaultSnapshot,
  restoreTrainVaultSnapshot,
  useActiveProgrammeOptional,
  useSessionLogs,
} from "@/lib/storage";
import type { TrainVaultSnapshot } from "@/lib/types";

const BOOTSTRAP_KEY = "agoge-cloud-bootstrap-v2";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function coerceSnapshot(value: unknown): TrainVaultSnapshot | null {
  if (!isPlainObject(value)) return null;

  const programme = isPlainObject(value.programme) ? value.programme : null;
  const logs = Array.isArray(value.logs) ? value.logs : [];

  if (!programme && logs.length === 0) return null;

  return {
    version: value.version === 1 ? 1 : 2,
    programme: programme as TrainVaultSnapshot["programme"],
    logs: logs as TrainVaultSnapshot["logs"],
    selectedTodayWorkoutId:
      typeof value.selectedTodayWorkoutId === "string" ? value.selectedTodayWorkoutId : null,
    programmeAnchor:
      typeof value.programmeAnchor === "string" ? value.programmeAnchor : null,
    programmeStartDate:
      typeof value.programmeStartDate === "string" ? value.programmeStartDate : null,
    blockProgress: isPlainObject(value.blockProgress)
      ? (value.blockProgress as TrainVaultSnapshot["blockProgress"])
      : {},
    blockResults: isPlainObject(value.blockResults)
      ? (value.blockResults as TrainVaultSnapshot["blockResults"])
      : {},
    workoutOverrides: isPlainObject(value.workoutOverrides)
      ? (value.workoutOverrides as TrainVaultSnapshot["workoutOverrides"])
      : {},
    exportedAt:
      typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(),
  };
}

function snapshotHasData(snapshot: TrainVaultSnapshot | null | undefined) {
  return Boolean(snapshot?.programme || (snapshot?.logs?.length ?? 0) > 0);
}

function mergeSnapshots(local: TrainVaultSnapshot, cloud: TrainVaultSnapshot): TrainVaultSnapshot {
  const logsById = new Map<string, TrainVaultSnapshot["logs"][number]>();

  for (const log of cloud.logs ?? []) logsById.set(log.id, log);
  for (const log of local.logs ?? []) logsById.set(log.id, log);

  return {
    version: 2,
    programme: local.programme ?? cloud.programme,
    logs: Array.from(logsById.values()).sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    ),
    selectedTodayWorkoutId: local.selectedTodayWorkoutId ?? cloud.selectedTodayWorkoutId ?? null,
    programmeAnchor: local.programmeAnchor ?? cloud.programmeAnchor ?? null,
    programmeStartDate: local.programmeStartDate ?? cloud.programmeStartDate ?? null,
    blockProgress: {
      ...(cloud.blockProgress ?? {}),
      ...(local.blockProgress ?? {}),
    },
    blockResults: {
      ...(cloud.blockResults ?? {}),
      ...(local.blockResults ?? {}),
    },
    workoutOverrides: {
      ...(cloud.workoutOverrides ?? {}),
      ...(local.workoutOverrides ?? {}),
    },
    exportedAt: new Date().toISOString(),
  };
}

async function pushSnapshot(snapshot: TrainVaultSnapshot) {
  const response = await fetch("/api/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: snapshot }),
  });

  if (!response.ok) {
    throw new Error("Cloud backup could not be updated.");
  }
}

export default function CloudBootstrap() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const attempted = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"recovered" | "secured">("recovered");

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (window.sessionStorage.getItem(BOOTSTRAP_KEY) === "done") return;
    window.sessionStorage.setItem(BOOTSTRAP_KEY, "done");

    void (async () => {
      const localSnapshot = getTrainVaultSnapshot();
      const localHasData = snapshotHasData(localSnapshot);
      let cloudSnapshot: TrainVaultSnapshot | null = null;

      try {
        const response = await fetch("/api/sync/pull", {
          method: "GET",
          cache: "no-store",
        });

        if (response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { data?: unknown; updated_at?: string }
            | null;
          cloudSnapshot = coerceSnapshot(payload?.data);
        }
      } catch {
        // Local data remains authoritative if the cloud is unavailable.
      }

      if (localHasData) {
        const merged = cloudSnapshot ? mergeSnapshots(localSnapshot, cloudSnapshot) : localSnapshot;
        restoreTrainVaultSnapshot(merged);

        try {
          await pushSnapshot(merged);
          setMessageType("secured");
          setMessage(
            `TrainVault history loaded in-place · ${merged.logs.length} session${merged.logs.length === 1 ? "" : "s"} · cloud backup secured.`,
          );
        } catch {
          setMessageType("recovered");
          setMessage(
            `TrainVault history loaded in-place · ${merged.logs.length} session${merged.logs.length === 1 ? "" : "s"}. Cloud backup will retry later.`,
          );
        }
        return;
      }

      if (cloudSnapshot) {
        restoreTrainVaultSnapshot(cloudSnapshot);
        setMessageType("recovered");
        setMessage(
          `Recovered your TrainVault data · ${cloudSnapshot.logs.length} session${cloudSnapshot.logs.length === 1 ? "" : "s"}.`,
        );
      }
    })();
  }, []);

  // Keep the hook subscriptions active so the dashboard immediately rerenders
  // when an in-place restore happens on the original TrainVault origin.
  void programme;
  void logs;

  if (!message) return null;

  return (
    <div className="fixed inset-x-3 top-16 z-[70] mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--green)_42%,var(--border))] bg-[var(--surface)] px-3 py-2.5 text-sm shadow-[var(--shadow-strong)] md:left-auto md:right-5 md:mx-0 md:w-[28rem]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--green-soft)] text-[var(--green)]">
        {messageType === "secured" ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <CloudDownload className="h-4 w-4" aria-hidden="true" />}
      </span>
      <p className="min-w-0 flex-1 font-bold text-[var(--text)]">{message}</p>
      <button
        type="button"
        onClick={() => setMessage(null)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
