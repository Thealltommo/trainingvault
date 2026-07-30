import V3CommandCenter from "@/components/V3CommandCenter";

export default function CommandPage() {
  return (
    <div className="grid gap-5">
      <header className="border-b border-[var(--border)] pb-5">
        <p className="tv-label text-[var(--accent)]">TrainVault V3 · command</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-[0.92] sm:text-6xl">
          Plan. Perform.
          <br />
          <span className="text-[var(--accent)]">Learn. Adapt.</span>
        </h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-[var(--muted)]">
          One operational surface for cloud state, recovery, the next seven days and the decisions worth protecting. Data can be sparse; confidence never gets invented.
        </p>
      </header>
      <V3CommandCenter />
    </div>
  );
}
