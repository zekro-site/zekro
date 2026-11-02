/** Page opening shared by every inner route: label, headline, lede, and the lamp behind them. */
export function PageHero({ label, title, lede, wide = false, children }: { label: string; title: React.ReactNode; lede: React.ReactNode; wide?: boolean; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <div className="lamp" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="shell relative pt-10 md:pt-14">
        <div className={`grid gap-6 lg:items-end lg:gap-5 ${wide ? "lg:grid-cols-[1.25fr_1fr]" : "lg:grid-cols-[1.4fr_1fr]"}`}>
          <div className="flex flex-col gap-3">
            <p className="mono-label">{label}</p>
            <h1 className="h1">{title}</h1>
          </div>
          <p className="lede max-w-[44ch] lg:pb-1">{lede}</p>
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}
