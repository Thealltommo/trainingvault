"use client";

import { type DragEvent, type FormEvent, useMemo, useState } from "react";
import { Copy, Download, FileUp, RotateCcw, Upload, X } from "lucide-react";
import { sampleProgramme } from "@/lib/sample-programme";
import {
  clearActiveProgramme,
  clearAllWorkoutOverrides,
  clearProgrammeAnchor,
  clearSelectedTodayWorkout,
  clearSessionLogs,
  clearWorkoutBlockProgressForProgramme,
  clearWorkoutBlockResultsForProgramme,
  clearWorkoutOverridesForProgramme,
  getAllWorkouts,
  getTrainVaultBackup,
  getTrainVaultSnapshot,
  restoreTrainVaultBackup,
  restoreTrainVaultSnapshot,
  saveActiveProgramme,
  updateProgrammeStartDate,
  useActiveProgrammeOptional,
  useSessionLogs,
  useTodayWorkoutOverride,
  useWorkoutOverrides,
} from "@/lib/storage";
import {
  detectImportKind,
  normalizeImportedBackup,
  normalizeImportedProgramme,
  validateProgrammeShape,
  type ImportKind,
} from "@/lib/programme-import";
import type { Programme, SessionLog, TrainVaultSnapshot, WorkoutOverride } from "@/lib/types";

type ParsedImport = {
  kind: ImportKind;
  programme: Programme | null;
  logs: SessionLog[] | null;
  workoutOverrides: Record<string, WorkoutOverride> | null;
  errors: string[];
  warnings: string[];
  message: string;
};

function parseImportText(jsonText: string): ParsedImport | null {
  const trimmed = jsonText.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const detectedKind = detectImportKind(parsed);
    const backup = normalizeImportedBackup(parsed);
    const programme = backup?.programme ?? normalizeImportedProgramme(parsed);
    const logs = backup?.logs ?? null;

    if (!programme) {
      const message =
        detectedKind === "unknown"
          ? "Found JSON, but no weeks array was detected. Expected a Programme object or { programme, logs } backup."
          : "Found a programme wrapper, but the programme could not be normalized.";

      return {
        kind: detectedKind,
        programme: null,
        logs: null,
        workoutOverrides: null,
        errors: [message],
        warnings: [],
        message,
      };
    }

    const validation = validateProgrammeShape(programme);
    const workoutCount = getAllWorkouts(programme).length;
    const kind: ImportKind = backup ? "backup" : "programme";

    return {
      kind,
      programme,
      logs,
      workoutOverrides: backup?.workoutOverrides ?? null,
      errors: validation.errors,
      warnings: validation.warnings,
      message: validation.ok
        ? `Found ${workoutCount} workouts. Ready to import.`
        : `Found a programme, but ${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"} must be fixed.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";

    return {
      kind: "unknown",
      programme: null,
      logs: null,
      workoutOverrides: null,
      errors: [`JSON could not be parsed: ${message}`],
      warnings: [],
      message: "JSON could not be parsed.",
    };
  }
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatCloudUpdatedAt(value: string | null) {
  if (!value) {
    return "Not checked";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function readSyncResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    data?: unknown;
    updated_at?: string;
    error?: string;
    ok?: boolean;
    diagnostics?: {
      envPresent?: boolean;
      keyPrefix?: string;
      syncId?: string;
      errorMessage?: string;
      errorCode?: string | null;
      serviceKeyLooksAnon?: boolean;
    };
  };

  if (!response.ok) {
    const diagnostics = payload.diagnostics
      ? ` Diagnostics: envPresent=${String(payload.diagnostics.envPresent)}, keyPrefix=${payload.diagnostics.keyPrefix ?? ""}, syncId=${payload.diagnostics.syncId ?? ""}, errorCode=${payload.diagnostics.errorCode ?? "none"}, serviceKeyLooksAnon=${String(payload.diagnostics.serviceKeyLooksAnon)}`
      : "";

    throw new Error(`${payload.error ?? "Cloud sync request failed."}${diagnostics}`);
  }

  return payload;
}

function ProgrammePreview({
  kind,
  programme,
  logs,
  workoutOverrides,
}: {
  kind: ImportKind;
  programme: Programme;
  logs?: SessionLog[] | null;
  workoutOverrides?: Record<string, WorkoutOverride> | null;
}) {
  const workouts = getAllWorkouts(programme);
  const phases = Array.from(new Set(workouts.map((workout) => workout.phase).filter(Boolean))).sort();
  const priorityCounts = workouts.reduce<Record<string, number>>((counts, workout) => {
    const priority = workout.priority ?? "Unset";
    counts[priority] = (counts[priority] ?? 0) + 1;
    return counts;
  }, {});
  const totalFullMinutes = workouts.reduce((total, workout) => total + workout.durationMinutes, 0);
  const totalMinimumMinutes = workouts.reduce(
    (total, workout) => total + (workout.minimumMinutes ?? workout.durationMinutes),
    0,
  );
  const firstSessionDate = workouts
    .map((workout) => workout.date)
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  const firstWeekSessions = programme.weeks[0]?.days.map((day) => day.workout.title) ?? [];

  return (
    <div className="mt-4 grid gap-3 text-sm font-bold text-[var(--muted)]">
      <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-2">
        <span>Import type</span>
        <span className="text-right font-black uppercase text-[var(--accent)]">{kind}</span>
      </div>
      <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-2">
        <span>Name</span>
        <span className="text-right text-[var(--text)]">{programme.name}</span>
      </div>
      <div className="flex justify-between border-t border-[var(--border)] pt-2">
        <span>Duration</span>
        <span className="text-[var(--text)]">{programme.durationWeeks} weeks</span>
      </div>
      <div className="flex justify-between border-t border-[var(--border)] pt-2">
        <span>Total sessions</span>
        <span className="text-[var(--text)]">{workouts.length}</span>
      </div>
      <div className="flex justify-between border-t border-[var(--border)] pt-2">
        <span>Full minutes total</span>
        <span className="text-[var(--text)]">{totalFullMinutes}</span>
      </div>
      <div className="flex justify-between border-t border-[var(--border)] pt-2">
        <span>Minimum minutes total</span>
        <span className="text-[var(--text)]">{totalMinimumMinutes}</span>
      </div>
      <div className="flex justify-between border-t border-[var(--border)] pt-2">
        <span>First session date</span>
        <span className="text-right text-[var(--text)]">{firstSessionDate ?? "Not set"}</span>
      </div>
      <div className="flex justify-between border-t border-[var(--border)] pt-2">
        <span>Target</span>
        <span className="text-right text-[var(--text)]">
          {programme.targetDate ? `${programme.targetEvent ? `${programme.targetEvent} / ` : ""}${programme.targetDate}` : "Not set"}
        </span>
      </div>
      <div className="border-t border-[var(--border)] pt-2">
        <span>Phases detected</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {phases.length > 0 ? (
            phases.map((phase) => (
              <span key={phase} className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--text)]">
                {phase}
              </span>
            ))
          ) : (
            <span className="text-xs font-black uppercase text-[var(--muted)]">None</span>
          )}
        </div>
      </div>
      <div className="border-t border-[var(--border)] pt-2">
        <span>Priority counts</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(priorityCounts).map(([priority, count]) => (
            <span key={priority} className="rounded-sm border border-[var(--border)] bg-black px-2 py-1 text-xs font-black uppercase text-[var(--text)]">
              {priority}: {count}
            </span>
          ))}
        </div>
      </div>
      <div className="border-t border-[var(--border)] pt-2">
        <span>First week sessions</span>
        <ol className="mt-2 grid gap-1 text-[var(--text)]">
          {firstWeekSessions.map((session, index) => (
            <li key={`${session}-${index}`}>
              {index + 1}. {session}
            </li>
          ))}
        </ol>
      </div>
      {logs ? (
        <div className="flex justify-between border-t border-[var(--border)] pt-2">
          <span>Logs count</span>
          <span className="text-[var(--text)]">{logs.length}</span>
        </div>
      ) : null}
      {workoutOverrides ? (
        <div className="flex justify-between border-t border-[var(--border)] pt-2">
          <span>Workout overrides</span>
          <span className="text-[var(--text)]">{Object.keys(workoutOverrides).length}</span>
        </div>
      ) : null}
    </div>
  );
}

function ValidationMessages({ parsed }: { parsed: ParsedImport | null }) {
  if (!parsed) {
    return (
      <p className="mt-3 text-sm font-bold text-[var(--muted)]">
        Upload or paste JSON to preview the import before saving.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      <p
        className={`rounded-md border px-3 py-2 text-sm font-bold ${
          parsed.errors.length === 0
            ? "border-[var(--accent)] bg-[rgba(215,255,47,0.12)] text-[var(--accent)]"
            : "border-[rgba(255,255,255,0.25)] bg-black text-[var(--text)]"
        }`}
      >
        {parsed.message}
      </p>
      {parsed.errors.length > 0 ? (
        <div className="rounded-md border border-[rgba(255,255,255,0.18)] bg-black p-3">
          <p className="tv-label text-[var(--text)]">Errors</p>
          <ul className="mt-2 grid gap-1 text-sm font-bold text-[var(--text)]">
            {parsed.errors.map((error) => (
              <li key={error} className="border-l-2 border-[var(--accent)] pl-2">
                {error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {parsed.warnings.length > 0 ? (
        <div className="rounded-md border border-[var(--border)] bg-black p-3">
          <p className="tv-label text-[var(--muted)]">Warnings</p>
          <ul className="mt-2 grid gap-1 text-sm font-bold text-[var(--muted)]">
            {parsed.warnings.map((warning) => (
              <li key={warning} className="border-l-2 border-[var(--border)] pl-2">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminImportPage() {
  const exampleJson = useMemo(() => JSON.stringify(sampleProgramme, null, 2), []);
  const activeProgramme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const todayOverride = useTodayWorkoutOverride();
  const workoutOverrides = useWorkoutOverrides();
  const [jsonText, setJsonText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const parsedImport = useMemo(() => parseImportText(jsonText), [jsonText]);
  const canImportProgramme = Boolean(parsedImport?.programme && parsedImport.errors.length === 0);
  const canRestoreBackup = Boolean(
    parsedImport?.kind === "backup" && parsedImport.programme && parsedImport.logs && parsedImport.errors.length === 0,
  );
  const activeOverrideCount = activeProgramme
    ? getAllWorkouts(activeProgramme).filter((workout) => workoutOverrides[workout.id]).length
    : Object.keys(workoutOverrides).length;

  function scrollToImportSource() {
    document.getElementById("programme-import-source")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function readImportFile(file: File | undefined) {
    if (!file) {
      return;
    }

    const text = await file.text();
    setJsonText(text);
    setMessage(`Loaded ${file.name}. Preview updated.`);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void readImportFile(event.dataTransfer.files[0]);
  }

  function handleValidate() {
    setMessage(parsedImport?.message ?? "Upload or paste JSON before validating.");
  }

  function handleImportProgramme() {
    if (!parsedImport?.programme || parsedImport.errors.length > 0) {
      setMessage("No valid programme is ready to import.");
      return;
    }

    if (activeProgramme) {
      clearWorkoutOverridesForProgramme(activeProgramme);
    }

    saveActiveProgramme(parsedImport.programme);
    clearSelectedTodayWorkout();
    setMessage(activeProgramme ? `Active programme replaced: ${parsedImport.programme.name}. Existing logs were left untouched.` : "Programme imported. Existing logs were left untouched.");
  }

  function handleImportBackup() {
    if (parsedImport?.kind !== "backup" || !parsedImport.programme || !parsedImport.logs || parsedImport.errors.length > 0) {
      setMessage("No valid full backup is ready to restore.");
      return;
    }

    const confirmed = window.confirm("Restore this backup and replace the current programme and logs?");

    if (!confirmed) {
      setMessage("Backup restore cancelled.");
      return;
    }

    restoreTrainVaultBackup({
      programme: parsedImport.programme,
      logs: parsedImport.logs,
      workoutOverrides: parsedImport.workoutOverrides ?? {},
    });
    clearSelectedTodayWorkout();
    setMessage("Full backup restored: programme, logs, and workout overrides replaced.");
  }

  function handleReset() {
    const confirmed = window.confirm("Reset to the sample programme? Existing logs will be kept.");

    if (!confirmed) {
      setMessage("Sample programme reset cancelled.");
      return;
    }

    if (activeProgramme) {
      clearWorkoutOverridesForProgramme(activeProgramme);
    }

    saveActiveProgramme(sampleProgramme);
    clearSelectedTodayWorkout();
    setJsonText(exampleJson);
    setMessage("Sample programme restored. Logs were left untouched.");
  }

  function handleClearLogs() {
    const confirmed = window.confirm("Clear all session logs from this browser?");

    if (!confirmed) {
      setMessage("Clear logs cancelled.");
      return;
    }

    clearSessionLogs();
    setMessage("All session logs cleared.");
  }

  function handleClearActiveProgramme() {
    const confirmed = window.confirm("Clear the active programme? Logs will be kept.");

    if (!confirmed) {
      setMessage("Clear active programme cancelled.");
      return;
    }

    if (activeProgramme) {
      clearWorkoutOverridesForProgramme(activeProgramme);
    }

    clearActiveProgramme();
    setMessage("Active programme cleared. Logs were kept.");
  }

  function handleClearProgrammeAndLogs() {
    const confirmed = window.confirm("Clear programme and all logs? This cannot be undone.");

    if (!confirmed) {
      setMessage("Clear programme and logs cancelled.");
      return;
    }

    if (activeProgramme) {
      clearWorkoutBlockProgressForProgramme(activeProgramme);
      clearWorkoutBlockResultsForProgramme(activeProgramme);
      clearWorkoutOverridesForProgramme(activeProgramme);
    }

    clearActiveProgramme();
    clearSessionLogs();
    setMessage("Programme, logs, selected today session, block progress, and workout overrides were cleared.");
  }

  function handleClearWorkoutOverrides() {
    const confirmed = window.confirm("Clear all moved/edited session changes? Original imported programme will remain.");

    if (!confirmed) {
      setMessage("Clear workout overrides cancelled.");
      return;
    }

    clearAllWorkoutOverrides();
    setMessage("All moved/edited session changes were cleared. Original imported programme remains.");
  }

  function handleClearSelectedToday() {
    clearSelectedTodayWorkout();
    setMessage("Selected today session cleared.");
  }

  function handleClearProgrammeAnchor() {
    clearProgrammeAnchor();
    setMessage("Programme anchor cleared.");
  }

  function handleCopyExample() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(exampleJson);
    }
  }

  function handleExportProgramme() {
    if (!activeProgramme) {
      setMessage("No active programme to export.");
      return;
    }

    downloadJson("trainvault-programme.json", activeProgramme);
  }

  function handleExportBackup() {
    if (!activeProgramme) {
      setMessage("No active programme to include in a backup.");
      return;
    }

    downloadJson("trainvault-backup.json", getTrainVaultBackup() ?? { programme: activeProgramme, logs, workoutOverrides });
  }

  async function handlePullFromCloud() {
    const confirmed = window.confirm("Pulling from cloud will replace local data on this device. Continue?");

    if (!confirmed) {
      setCloudStatus("Cloud pull cancelled.");
      return;
    }

    setIsSyncing(true);
    setCloudStatus("Pulling from cloud...");

    try {
      const response = await fetch("/api/sync/pull", {
        method: "GET",
        cache: "no-store",
      });
      const payload = await readSyncResponse(response);

      if (!payload.data) {
        setCloudStatus("No cloud backup yet.");
        setCloudUpdatedAt(null);
        return;
      }

      if (typeof payload.data !== "object" || Array.isArray(payload.data)) {
        setCloudStatus("Cloud backup is not a valid TrainVault snapshot.");
        return;
      }

      restoreTrainVaultSnapshot(payload.data as TrainVaultSnapshot);
      setCloudUpdatedAt(payload.updated_at ?? null);
      setCloudStatus("Pulled successfully.");
      setMessage("Cloud backup restored to this device.");
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : "Cloud pull failed.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handlePushToCloud() {
    const confirmed = window.confirm("Pushing to cloud will replace the cloud backup with this device's data. Continue?");

    if (!confirmed) {
      setCloudStatus("Cloud push cancelled.");
      return;
    }

    setIsSyncing(true);
    setCloudStatus("Pushing to cloud...");

    try {
      const response = await fetch("/api/sync/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: getTrainVaultSnapshot(),
        }),
      });
      const payload = await readSyncResponse(response);

      setCloudUpdatedAt(payload.updated_at ?? null);
      setCloudStatus("Pushed successfully.");
      setMessage("This device's TrainVault data was pushed to cloud.");
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : "Cloud push failed.");
    } finally {
      setIsSyncing(false);
    }
  }

  function handleStartDateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProgramme) {
      setMessage("Import a programme before setting a start date.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const startDate = String(formData.get("startDate") ?? "");
    updateProgrammeStartDate(startDate || null);
    setMessage(startDate ? `Programme start date set to ${startDate}.` : "Programme start date cleared.");
  }

  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="tv-label text-[var(--accent)]">Admin Import</p>
        <h1 className="mt-2 text-5xl font-black uppercase leading-none sm:text-6xl">Programme JSON</h1>
        <p className="mt-3 max-w-2xl text-base font-bold text-[var(--muted)]">
          Upload or paste a programme, preview the normalized sessions, then choose exactly what to replace.
        </p>
      </header>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="grid min-w-0 content-start gap-4">
          <article id="programme-import-source" className="tv-card min-w-0 scroll-mt-4 p-4">
            <p className="tv-label text-[var(--accent)]">1. Import Source</p>
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`mt-3 grid min-h-36 cursor-pointer place-items-center rounded-md border border-dashed p-4 text-center transition-colors ${
                isDragging
                  ? "border-[var(--accent)] bg-[rgba(215,255,47,0.12)]"
                  : "border-[var(--border)] bg-black hover:border-[rgba(215,255,47,0.45)]"
              }`}
            >
              <input
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => void readImportFile(event.target.files?.[0])}
              />
              <span className="grid gap-2">
                <FileUp className="mx-auto h-7 w-7 text-[var(--accent)]" aria-hidden="true" />
                <span className="text-sm font-black uppercase text-[var(--text)]">Drop JSON or choose file</span>
                <span className="text-xs font-bold text-[var(--muted)]">Programme JSON or trainvault-backup.json</span>
              </span>
            </label>

            <label className="mt-4 grid gap-2">
              <span className="tv-label">Or Paste JSON</span>
              <textarea
                className="tv-input min-h-[24rem] resize-y py-3 font-mono text-sm"
                value={jsonText}
                onChange={(event) => {
                  setJsonText(event.target.value);
                  setMessage(null);
                }}
                placeholder={exampleJson.slice(0, 420)}
                spellCheck={false}
              />
            </label>
          </article>

          <article className="tv-card min-w-0 p-4">
            <p className="tv-label text-[var(--accent)]">3. Actions</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={handleValidate} className="tv-button-ghost">
                Validate Only
              </button>
              <button
                type="button"
                onClick={handleImportProgramme}
                disabled={!canImportProgramme}
                className="tv-button-primary disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {activeProgramme ? "Replace Active Programme" : "Import Programme"}
              </button>
              <button
                type="button"
                onClick={handleImportBackup}
                disabled={!canRestoreBackup}
                className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
              >
                Restore Backup
              </button>
              <button type="button" onClick={handleReset} className="tv-button-ghost">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset to Sample
              </button>
            </div>
            {message ? (
              <p className="mt-3 rounded-md border border-[var(--border)] bg-black px-3 py-2 text-sm font-bold text-[var(--text)]">
                {message}
              </p>
            ) : null}
            {parsedImport?.programme && activeProgramme ? (
              <p className="mt-3 text-sm font-bold text-[var(--muted)]">
                Importing will replace: <span className="text-[var(--accent)]">{activeProgramme.name}</span>
              </p>
            ) : null}
          </article>
        </div>

        <aside className="grid min-w-0 content-start gap-4">
          <article className="tv-card min-w-0 p-4">
            <p className="tv-label text-[var(--accent)]">2. Preview</p>
            {parsedImport?.programme ? (
              <ProgrammePreview
                kind={parsedImport.kind}
                programme={parsedImport.programme}
                logs={parsedImport.logs}
                workoutOverrides={parsedImport.workoutOverrides}
              />
            ) : null}
            <ValidationMessages parsed={parsedImport} />
          </article>

          <article className="tv-card min-w-0 p-4">
            <p className="tv-label">Active Programme</p>
            <h2 className="mt-2 break-words text-2xl font-black uppercase">
              {activeProgramme ? activeProgramme.name : "No active programme"}
            </h2>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">
              {activeProgramme
                ? activeProgramme.startDate
                  ? `Starts ${activeProgramme.startDate}`
                  : "No start date set"
                : "Import a programme or reset to the sample programme."}
            </p>
            {activeOverrideCount > 0 ? (
              <p className="mt-2 text-xs font-black uppercase text-[var(--accent)]">
                {activeOverrideCount} moved/edited session change{activeOverrideCount === 1 ? "" : "s"} stored
              </p>
            ) : null}
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={scrollToImportSource} className="tv-button-primary">
                Replace programme
              </button>
              <p className="text-xs font-bold text-[var(--muted)]">
                Importing a new programme will overwrite the current active programme. Logs are kept unless you clear them.
              </p>
              <button
                type="button"
                onClick={handleClearActiveProgramme}
                disabled={!activeProgramme}
                className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear active programme
              </button>
              <button
                type="button"
                onClick={handleClearProgrammeAndLogs}
                disabled={!activeProgramme && logs.length === 0}
                className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear programme + logs
              </button>
              <button
                type="button"
                onClick={handleClearSelectedToday}
                disabled={!todayOverride}
                className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Clear selected today
              </button>
              <button
                type="button"
                onClick={handleClearProgrammeAnchor}
                disabled={!activeProgramme?.startDate}
                className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear programme anchor
              </button>
              <button
                type="button"
                onClick={handleExportProgramme}
                disabled={!activeProgramme}
                className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export Programme
              </button>
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={!activeProgramme}
                className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export Backup
              </button>
            </div>
          </article>

          <article className="tv-card min-w-0 p-4">
            <p className="tv-label">Start Date</p>
            <form onSubmit={handleStartDateSubmit} className="mt-3 grid gap-2">
              <input
                key={`${activeProgramme?.id ?? "none"}-${activeProgramme?.startDate ?? "none"}`}
                className="tv-input"
                type="date"
                name="startDate"
                defaultValue={activeProgramme?.startDate ?? ""}
                disabled={!activeProgramme}
              />
              <div className="grid grid-cols-2 gap-2">
                <button type="submit" disabled={!activeProgramme} className="tv-button-primary disabled:cursor-not-allowed disabled:opacity-45">
                  Set Date
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearProgrammeAnchor();
                    setMessage("Programme start date cleared.");
                  }}
                  disabled={!activeProgramme?.startDate}
                  className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Clear
                </button>
              </div>
            </form>
            {todayOverride ? (
              <p className="mt-3 text-xs font-black uppercase text-[var(--accent)]">Selected today session is set</p>
            ) : (
              <p className="mt-3 text-xs font-black uppercase text-[var(--muted)]">No selected today session</p>
            )}
            <button
              type="button"
              onClick={handleClearSelectedToday}
              disabled={!todayOverride}
              className="tv-button-ghost mt-3 w-full disabled:cursor-not-allowed disabled:opacity-45"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear selected today session
            </button>
          </article>

          <article className="tv-card min-w-0 border-[rgba(215,255,47,0.28)] p-4">
            <p className="tv-label text-[var(--accent)]">Cloud Sync</p>
            <h2 className="mt-2 break-words text-2xl font-black uppercase">Manual backup</h2>
            <p className="mt-2 break-words text-sm font-bold text-[var(--muted)]">
              Sync stores one private TrainVault backup in Supabase so desktop and phone can share the same programme and logs.
            </p>
            {!activeProgramme ? (
              <p className="mt-3 break-words rounded-md border border-[rgba(215,255,47,0.28)] bg-black px-3 py-2 text-sm font-bold text-[var(--accent)]">
                No local programme. Pull from Cloud can restore this device if a cloud backup exists.
              </p>
            ) : null}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void handlePullFromCloud()}
                disabled={isSyncing}
                className="tv-button-primary w-full disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Pull from Cloud
              </button>
              <button
                type="button"
                onClick={() => void handlePushToCloud()}
                disabled={isSyncing}
                className="tv-button-ghost w-full disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Push to Cloud
              </button>
            </div>
            <div className="mt-3 grid gap-1 border-t border-[var(--border)] pt-3 text-sm font-bold">
              <p className="break-words text-[var(--muted)]">
                Last cloud updated: <span className="text-[var(--text)]">{formatCloudUpdatedAt(cloudUpdatedAt)}</span>
              </p>
              {cloudStatus ? <p className="break-words text-[var(--accent)]">{cloudStatus}</p> : null}
            </div>
          </article>

          <article className="tv-card min-w-0 p-4">
            <p className="tv-label">Utilities</p>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">{logs.length} completed session logs stored locally.</p>
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={handleClearLogs} className="tv-button-ghost">
                Clear all logs
              </button>
              <button
                type="button"
                onClick={handleClearWorkoutOverrides}
                disabled={Object.keys(workoutOverrides).length === 0}
                className="tv-button-ghost disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear all workout overrides
              </button>
              <button type="button" onClick={handleCopyExample} className="tv-button-ghost">
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy sample JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  setJsonText(exampleJson);
                  setMessage("Sample JSON loaded into the import source.");
                }}
                className="tv-button-ghost"
              >
                Use sample JSON
              </button>
            </div>
            <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-[var(--border)] bg-black p-3 text-xs text-[var(--muted)]">
              {exampleJson}
            </pre>
          </article>
        </aside>
      </section>
    </div>
  );
}
