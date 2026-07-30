import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import V3CommandCenter from "@/components/V3CommandCenter";

export default function CommandPage() {
  return (
    <div className="grid gap-5">
      <header className="tv-product-hero overflow-hidden rounded-2xl border border-white/10 px-5 py-6 sm:px-7 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="tv-label text-[var(--accent)]">TrainVault V3 · command</p>
            <h1 className="mt-2 text-4xl font-black uppercase leading-[0.9] tracking-[-0.035em] sm:text-6xl">
              Plan. Perform.
              <br />
              <span className="text-[var(--accent)]">Learn. Adapt.</span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm font-bold leading-relaxed text-[var(--muted)]">
              One operational surface for cloud state, recovery, the next seven days and the decisions worth protecting. Evidence can be sparse; confidence never gets invented.
            </p>
          </div>
          <Link href="/plan/build" className="tv-button-primary shrink-0">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Build a training block
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>
      <V3CommandCenter />
    </div>
  );
}
