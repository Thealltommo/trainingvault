"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Dumbbell,
  Flag,
  Footprints,
  Mountain,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  buildPlanStudioSessions,
  planStudioGoalLabel,
  type PlanStudioGoal,
} from "@/lib/plan-studio";
import { createManualSession, saveManualSession } from "@/lib/planning-storage";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const goals: Array<{
  id: PlanStudioGoal;
  title: string;
  copy: string;
  icon: typeof Target;
}> = [
  { id: "5k", title: "Faster 5K", copy: "Speed, threshold and enough aerobic volume to move the needle.", icon: Target },
  { id: "10k", title: "Faster 10K", copy: "Longer threshold work with enough speed to keep the ceiling high.", icon: Footprints },
  { id: "half", title: "Half marathon", copy: "Durability, threshold and progressive long-run capacity.", icon: Flag },
  { id: "spartan", title: "Spartan / mountain", copy: "Trail durability, hills and hybrid work without losing running quality.", icon: Mountain },
  { id: "hybrid", title: "Hybrid engine", copy: "Protect one key run stimulus while strength and conditioning stay in the week.", icon: Dumbbell },
];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toggleDay(days: number[], day: number) {
  return days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort((a, b) => a - b);
}

export default function PlanStudioPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<PlanStudioGoal>("5k");
  const [startDate, setStartDate] = useState(() => localDateKey(new Date()));
  const [targetDate, setTargetDate] = useState("");
  const [targetLabel, setTargetLabel] = useState("Sub-20 5K");
  const [weeks, setWeeks] = useState<8 | 10 | 12>(12);
  const [runDays, setRunDays] = useState<number[]>([1, 3, 5, 6]);
  const [longRunDay, setLongRunDay] = useState(6);
  const [hawkeyeDays, setHawkeyeDays] = useState<number[]>([0, 2]);
  const [currentFiveK, setCurrentFiveK] = useState("22:19");
  const [targetFiveK, setTargetFiveK] = useState("19:59");
  const [saved, setSaved] = useState(false);

  const sessions = useMemo(
    () =>
      buildPlanStudioSessions({
        goal,
        startDate,
        targetDate: targetDate || undefined,
        targetLabel: targetLabel || undefined,
        weeks,
        runDays,
        longRunDay,
        hawkeyeDays,
        currentFiveK: currentFiveK || undefined,
        targetFiveK: targetFiveK || undefined,
      }),
    [goal, startDate, targetDate, targetLabel, weeks, runDays, longRunDay, hawkeyeDays, currentFiveK, targetFiveK],
  );

  const runCount = sessions.filter((session) => session.type === "run" || session.type === "fell-trail").length;
  const hybridCount = sessions.filter((session) => session.type === "crossfit").length;
  const firstFortnight = sessions.filter((session) => session.week <= 2);

  function savePlan() {
    if (saved || runDays.length < 2) return;
    sessions.forEach((session) => {
      saveManualSession(
        createManualSession({
          title: session.title,
          type: session.type,
          scheduledDate: session.date,
          durationMinutes: session.durationMinutes,
          minimumMinutes: session.minimumMinutes,
          intensity: session.intensity,
          prescription: session.prescription,
          targetStimulus: session.targetStimulus,
        }),
      );
    });
    setSaved(true);
    window.setTimeout(() => router.push("/plan"), 350);
  }

  return (
    <div className="grid gap-5">
      <header className="tv-product-hero overflow-hidden rounded-2xl border border-white/10 px-5 py-6 sm:px-7 sm:py-8">
        <Link href="/plan" className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase text-[var(--muted)] transition-colors hover:text-[var(--accent)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Calendar
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="tv-label text-[var(--accent)]">Plan Studio · guided build</p>
            <h1 className="mt-2 max-w-4xl text-4xl font-black uppercase leading-[0.9] tracking-[-0.035em] sm:text-6xl">
              Build the block.<br /><span className="text-[var(--accent)]">Keep the life around it.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-bold leading-relaxed text-[var(--muted)]">
              Pick the outcome, your real training days and fixed hybrid commitments. TrainVault creates a conservative starting block you can inspect before a single session is saved.
            </p>
          </div>
          <div className="grid min-w-52 grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/35 p-2 backdrop-blur">
            {[1, 2, 3].map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => setStep(number)}
                className={`min-h-12 rounded-lg border text-xs font-black uppercase transition-colors ${step === number ? "border-[var(--accent)] bg-[rgba(215,255,47,0.12)] text-[var(--accent)]" : "border-white/10 text-[var(--muted)]"}`}
              >
                0{number}
              </button>
            ))}
          </div>
        </div>
      </header>

      {step === 1 ? (
        <section className="grid gap-4">
          <div>
            <p className="tv-label text-[var(--accent)]">01 · Outcome</p>
            <h2 className="mt-2 text-3xl font-black uppercase">What are we training for?</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {goals.map((item) => {
              const Icon = item.icon;
              const active = goal === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setGoal(item.id)}
                  className={`tv-choice-card text-left ${active ? "tv-choice-card-active" : ""}`}
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${active ? "bg-[var(--accent)] text-black" : "bg-white/5 text-[var(--muted)]"}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-black uppercase">{item.title}</h3>
                  <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">{item.copy}</p>
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
            <label className="grid gap-2">
              <span className="tv-label">Start date</span>
              <input type="date" className="tv-input" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Block length</span>
              <select className="tv-input" value={weeks} onChange={(event) => setWeeks(Number(event.target.value) as 8 | 10 | 12)}>
                <option value={8}>8 weeks</option>
                <option value={10}>10 weeks</option>
                <option value={12}>12 weeks</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Target date · optional</span>
              <input type="date" className="tv-input" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="tv-label">Target label</span>
              <input className="tv-input" value={targetLabel} onChange={(event) => setTargetLabel(event.target.value)} placeholder="Sub-20 5K" />
            </label>
          </div>
          {goal === "5k" ? (
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="tv-label">Current 5K</span>
                <input className="tv-input" value={currentFiveK} onChange={(event) => setCurrentFiveK(event.target.value)} placeholder="22:19" />
              </label>
              <label className="grid gap-2">
                <span className="tv-label">Target 5K</span>
                <input className="tv-input" value={targetFiveK} onChange={(event) => setTargetFiveK(event.target.value)} placeholder="19:59" />
              </label>
            </div>
          ) : null}
          <div className="flex justify-end">
            <button type="button" onClick={() => setStep(2)} className="tv-button-primary">
              Set my week <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="grid gap-5">
          <div>
            <p className="tv-label text-[var(--accent)]">02 · Real week</p>
            <h2 className="mt-2 text-3xl font-black uppercase">Tell TrainVault what cannot move.</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">Choose at least two running days. Fixed Hawkeye days are added as real load instead of pretending they do not exist.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="tv-soft-card p-5">
              <div className="flex items-center gap-3">
                <Footprints className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                <div>
                  <p className="tv-label text-[var(--accent)]">Running days</p>
                  <h3 className="mt-1 text-xl font-black uppercase">Where can quality live?</h3>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {weekdays.map((day, index) => (
                  <button key={day} type="button" onClick={() => setRunDays((current) => toggleDay(current, index))} className={`tv-day-button ${runDays.includes(index) ? "tv-day-button-active" : ""}`}>
                    {day}
                  </button>
                ))}
              </div>
              <label className="mt-5 grid gap-2">
                <span className="tv-label">Preferred long-run day</span>
                <select className="tv-input" value={longRunDay} onChange={(event) => setLongRunDay(Number(event.target.value))}>
                  {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </label>
            </article>

            <article className="tv-soft-card p-5">
              <div className="flex items-center gap-3">
                <Dumbbell className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                <div>
                  <p className="tv-label text-[var(--accent)]">Fixed commitments</p>
                  <h3 className="mt-1 text-xl font-black uppercase">Hawkeye / CrossFit</h3>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {weekdays.map((day, index) => (
                  <button key={day} type="button" onClick={() => setHawkeyeDays((current) => toggleDay(current, index))} className={`tv-day-button ${hawkeyeDays.includes(index) ? "tv-day-button-active" : ""}`}>
                    {day}
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="text-sm font-bold text-[var(--muted)]">TrainVault will keep this load visible to readiness and interference logic. It does not assume every class is the same; log the actual lower-body and conditioning cost afterward.</p>
              </div>
            </article>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setStep(1)} className="tv-button-ghost">Back</button>
            <button type="button" disabled={runDays.length < 2} onClick={() => setStep(3)} className="tv-button-primary disabled:cursor-not-allowed disabled:opacity-40">
              Preview block <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="grid gap-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="tv-label text-[var(--accent)]">03 · Inspect before save</p>
              <h2 className="mt-2 text-3xl font-black uppercase">{planStudioGoalLabel(goal)} · {weeks} weeks</h2>
              <p className="mt-2 text-sm font-bold text-[var(--muted)]">Recovery weeks are already reduced. TrainVault can still move or scale individual sessions later; this is the baseline, not a prison sentence.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="tv-metric-tile"><CalendarDays className="h-4 w-4 text-[var(--accent)]" /><span className="tv-label">Total</span><strong>{sessions.length}</strong></div>
              <div className="tv-metric-tile"><Footprints className="h-4 w-4 text-[var(--accent)]" /><span className="tv-label">Runs</span><strong>{runCount}</strong></div>
              <div className="tv-metric-tile"><Dumbbell className="h-4 w-4 text-[var(--accent)]" /><span className="tv-label">Hybrid</span><strong>{hybridCount}</strong></div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {firstFortnight.map((session) => (
              <article key={`${session.week}-${session.date}-${session.title}`} className="tv-session-preview">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="tv-label text-[var(--accent)]">Week {session.week} · {session.date}</p>
                    <h3 className="mt-2 text-lg font-black uppercase">{session.title}</h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[0.62rem] font-black uppercase text-[var(--muted)]">{session.intensity}</span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm font-bold leading-relaxed text-[var(--muted)]">{session.prescription}</p>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs font-black uppercase">
                  <span>{session.durationMinutes} min</span>
                  <span className="text-[var(--accent)]">{session.role}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="rounded-2xl border border-[rgba(215,255,47,0.28)] bg-[linear-gradient(120deg,rgba(215,255,47,0.09),transparent_60%)] p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <p className="tv-label text-[var(--accent)]">Guardrail</p>
                <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">This builder creates a conservative deterministic baseline. It does not use recovery data to fabricate future certainty. Daily Full / Adjusted / Minimum decisions stay separate and evidence-led.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setStep(2)} className="tv-button-ghost">Edit week</button>
            <button type="button" onClick={savePlan} disabled={saved} className="tv-button-primary min-w-48 disabled:opacity-60">
              {saved ? <><Check className="h-4 w-4" /> Block added</> : <><Sparkles className="h-4 w-4" /> Build my block</>}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
