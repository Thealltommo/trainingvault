"use client";

import Link from "next/link";
import { BrainCircuit, DatabaseBackup, Plus, Sparkles } from "lucide-react";
import AgogeWarriorArt from "@/components/AgogeWarriorArt";
import CoachingDashboard from "@/components/CoachingDashboard";
import { useActiveProgrammeOptional, useSessionLogs } from "@/lib/storage";

export default function CoachingPage() {
  const programme = useActiveProgrammeOptional();
  const logs = useSessionLogs();

  if (programme) {
    return <CoachingDashboard />;
  }

  return (
    <div className="agoge-page">
      <section className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[var(--sidebar)] p-5 text-white shadow-[var(--shadow-strong)] sm:p-7">
        <AgogeWarriorArt className="pointer-events-none absolute -right-24 -top-24 h-[38rem] w-[38rem] opacity-[0.5]" variant="combined" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,15,32,0.99)_0%,rgba(3,20,42,0.9)_52%,rgba(3,20,42,0.25)_100%)]" />
        <div className="relative z-10 flex min-h-[310px] max-w-2xl flex-col justify-end">
          <div className="flex items-center gap-2 text-[#84b1ff]">
            <BrainCircuit className="h-5 w-5" aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-[0.14em]">Agoge coaching</p>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] sm:text-4xl">The coach should start from your history — not an import screen.</h1>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-[#b8c8da]">
            {logs.length > 0
              ? `${logs.length} training session${logs.length === 1 ? " is" : "s are"} already available. Build a plan from them, or recover the rest of TrainVault first.`
              : "Recover your existing TrainVault history or start logging immediately. Then The Agoge can build and audit the next block from actual evidence."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/migrate" className="tv-button-primary">
              <DatabaseBackup className="h-4 w-4" aria-hidden="true" />
              Recover TrainVault data
            </Link>
            <Link href="/program/build" className="tv-button-ghost border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Build training plan
            </Link>
            <Link href="/log" className="tv-button-ghost border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Log a run
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
