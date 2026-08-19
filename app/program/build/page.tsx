"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Dumbbell,
  Gauge,
  Mountain,
  Route,
  Sparkles,
  Target,
} from "lucide-react";
import AgogeWarriorArt from "@/components/AgogeWarriorArt";
import {
  buildAgogeProgramme,
  inferTrainingHistory,
  type PlanGoal,
} from "@/lib/plan-builder";
import {
  clearSelectedTodayWorkout,
  saveActiveProgramme,
  useActiveProgrammeOptional,
  useSessionLogs,
} from "@/lib/storage";

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const goalOptions: Array<{ value: PlanGoal; label: string; description: string }> = [
  { value: "hybrid", label: "Hybrid", description: "5K/10K speed + Spartan/fell durability + CrossFit" },
  { value: "5k", label: "5K", description: "Speed, threshold and economy while retaining CrossFit" },
  { value: "10k", label: "10K", description: "Threshold strength, aerobic durability and a faster 5K engine" },
  { value: "spartan", label: "Spartan", description: "Hills, long-run durability and obstacle-race running power" },
];

export default function BuildPlanPage() {
  const router = useRouter();
  const activeProgramme = useActiveProgrammeOptional();
  const logs = useSessionLogs();
  const history = useMemo(() => inferTrainingHistory(logs), [logs]);
  const [name, setName] = useState("Agoge Hybrid Build");
  const [goal, setGoal] = useState<PlanGoal>("hybrid");
  const [startDate, setStartDate] = useState(todayKey());
  const [weeks, setWeeks] = useState(12);
  const [targetEvent, setTargetEvent] = useState("Spartan 2027 build");
  const [targetDate, setTargetDate] = useState("");
  const [current5k, setCurrent5k] = useState("");
  const [target5k, setTarget5k] = useState("19:59");
  const [crossFitSessions, setCrossFitSessions] = useState<2 | 3>(3);
  const [longRunStartMinutes, setLongRunStartMinutes] = useState(history.suggestedLongRunMinutes);
  const [created, setCreated] = useState(false);

  const preview = useMemo(
    () =>
      buildAgogeProgramme(
        {
          name,
          goal,
          startDate,
          weeks,
          targetEvent,
          targetDate,
          current5k,
          target5k,
          crossFitSessions,
          longRunStartMinutes,
        },
        logs,
      ),
    [name, goal, startDate, weeks, targetEvent, targetDate, current5k, target5k, crossFitSessions, longRunStartMinutes, logs],
  );
  const firstWeek = preview.weeks[0];

  function createPlan() {
    if (activeProgramme) {
      const confirmed = window.confirm(
        `Replace the active programme “${activeProgramme.name}” with this generated plan? Your existing session logs will be kept.`,
      );
      if (!confirmed) return;
    }

    saveActiveProgramme(preview);
    clearSelectedTodayWorkout();
    setCreated(true);
    window.setTimeout(() => router.push("/program"), 500);
  }

  return (
    <div className="agoge-page">
      <Link href="/program" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[var(--muted)] hover:text-[var(--accent)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Training plan
      </Link>

      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--sidebar)] p-5 text-white shadow-[var(--shadow-strong)] sm:p-6">
        <AgogeWarriorArt className="pointer-events-none absolute -right-20 -top-28 h-[34rem] w-[34rem] opacity-[0.42]" variant="combined" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,16,34,0.98)_0%,rgba(4,20,43,0.88)_52%,rgba(4,20,43,0.28)_100%)]" />
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-[#82afff]">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-[0.14em]">Native plan builder</p>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl">Build it here. No JSON. No generic three-run loop.</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-[#b9c8da]">
            The builder uses your existing training history where it can, then creates a CrossFit-aware running progression with threshold as the anchor, rotating VO₂/speed/hills, varied long runs and race-week deload logic.
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <article className="tv-kpi">
          <Gauge className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">History</p>
          <p className="tv-kpi-value">{history.logs28d}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">sessions · last 28d</p>
        </article>
        <article className="tv-kpi">
          <Route className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">Run history</p>
          <p className="tv-kpi-value">{history.runLogs28d}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">run logs · last 28d</p>
        </article>
        <article className="tv-kpi">
          <Mountain className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          <p className="tv-label mt-2">Recent volume</p>
          <p className="tv-kpi-value">{history.averageWeeklyDistanceKm > 0 ? `${history.averageWeeklyDistanceKm.toFixed(1)} km` : "—"}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">average / week</p>
        </article>
        <article className="tv-kpi">
          <Dumbbell className="h-4.5 w-4.5 text-[var(--red)]" aria-hidden="true" />
          <p className="tv-label mt-2">Training rate</p>
          <p className="tv-kpi-value">{history.sessionsPerWeek.toFixed(1)}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">sessions / week</p>
        </article>
        <article className="tv-kpi">
          <BrainCircuit className="h-4.5 w-4.5 text-[var(--accent)]" aria-hidden="true" />
          <p className="tv-label mt-2">Suggested long run</p>
          <p className="tv-kpi-value">{history.suggestedLongRunMinutes}m</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">history-informed start</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <form className="tv-card grid content-start gap-5 p-4 sm:p-5" onSubmit={(event) => event.preventDefault()}>
          <div>
            <p className="tv-label text-[var(--accent)]">Plan inputs</p>
            <h2 className="mt-1 text-xl font-black tracking-tight">Tell The Agoge what we are building.</h2>
          </div>

          <label className="grid gap-2">
            <span className="tv-label">Plan name</span>
            <input className="tv-input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div>
            <p className="tv-label">Primary emphasis</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {goalOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setGoal(option.value)}
                  className={`rounded-xl border p-3 text-left transition-colors ${goal === option.value ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface-strong)] hover:border-[var(--accent)]"}`}
                >
                  <p className={`text-sm font-black ${goal === option.value ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{option.label}</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--muted)]">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="tv-label">Start date</span>
              <input className="tv-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Block length</span>
              <select className="tv-input" value={weeks} onChange={(event) => setWeeks(Number(event.target.value))}>
                {[8, 10, 12, 14, 16].map((value) => <option key={value} value={value}>{value} weeks</option>)}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Current 5K</span>
              <input className="tv-input" value={current5k} onChange={(event) => setCurrent5k(event.target.value)} placeholder="e.g. 22:19" inputMode="numeric" />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Target 5K</span>
              <input className="tv-input" value={target5k} onChange={(event) => setTarget5k(event.target.value)} placeholder="19:59" inputMode="numeric" />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">CrossFit sessions / week</span>
              <select className="tv-input" value={crossFitSessions} onChange={(event) => setCrossFitSessions(Number(event.target.value) as 2 | 3)}>
                <option value={2}>2 sessions</option>
                <option value={3}>3 sessions</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Starting long run</span>
              <select className="tv-input" value={longRunStartMinutes} onChange={(event) => setLongRunStartMinutes(Number(event.target.value))}>
                {[45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 105, 120].map((value) => <option key={value} value={value}>{value} min</option>)}
              </select>
              <span className="text-[0.68rem] font-semibold text-[var(--muted)]">Suggested from history: {history.suggestedLongRunMinutes} min</span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="tv-label">Target event</span>
              <input className="tv-input" value={targetEvent} onChange={(event) => setTargetEvent(event.target.value)} placeholder="Spartan Super / Trifecta weekend" />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Target date</span>
              <input className="tv-input" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
            </label>
          </div>
        </form>

        <aside className="grid content-start gap-3">
          <article className="tv-card overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="tv-label text-[var(--accent)]">Week 1 preview</p>
              <h2 className="mt-1 text-lg font-black tracking-tight">{firstWeek?.title}</h2>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {firstWeek?.days.map((item) => (
                <div key={item.id} className="grid grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-strong)] text-xs font-black text-[var(--muted)]">{item.dayNumber}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--text)]">{item.workout.title}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted)]">{item.workout.prescribedLoadsOrPace ?? item.workout.targetStimulus}</p>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${item.workout.intensity === "hard" ? "bg-[var(--red)]" : item.workout.intensity === "moderate" ? "bg-[var(--accent)]" : "bg-[var(--green)]"}`} />
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[var(--accent-soft)] p-4">
            <div className="flex items-start gap-3">
              <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-[var(--accent)]">What changes across the block</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--text)]">
                  Threshold remains the anchor. The second quality session rotates through VO₂, hill power, speed/economy and an absorb/benchmark week. Long runs grow gradually and become hilly or progressive rather than repeating the same prescription forever.
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-[color-mix(in_srgb,var(--red)_28%,var(--border))] bg-[var(--red-soft)] p-4">
            <div className="flex items-start gap-3">
              <Target className="mt-0.5 h-5 w-5 shrink-0 text-[var(--red)]" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-[var(--red)]">Race-week logic</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--text)]">
                  If the target race lands inside the block, The Agoge automatically reduces threshold volume, replaces the second hard run with a primer and treats the race as the week's quality + long-duration stimulus.
                </p>
              </div>
            </div>
          </article>

          <button type="button" onClick={createPlan} className="tv-button-primary min-h-14 w-full text-sm">
            {created ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
            {created ? "Plan created" : activeProgramme ? "Replace with this plan" : "Create training plan"}
          </button>
        </aside>
      </section>
    </div>
  );
}
