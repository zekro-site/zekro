"use client";

import { useChain } from "@/components/providers/ChainProvider";
import { CHAIN, explorerBlock } from "@/config/brand";
import { fmtInt, fmtUsd } from "@/lib/format";

/** Three live readings from Robinhood Chain, read on the server from the chain itself. */
export function LiveBand() {
  const { facts, failed } = useChain();
  const reading = !facts && !failed;
  const cell = (v: string | null) => (v ?? (reading ? "···" : "—"));
  const fresh = facts?.ethUsdAt ? Math.max(0, Math.round(facts.at / 1000 - facts.ethUsdAt)) : null;
  return (
    <div className="card flex flex-col gap-0 overflow-hidden" aria-live="polite" data-testid="live-band">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <span className="pill">
          <span className={`dot ${failed ? "dot-off" : "dot-live"}`} />
          {failed ? "chain not reachable" : `live · ${CHAIN.name}`}
        </span>
        <span className="mono hidden text-[12px] text-faint sm:inline">chainlink + rpc · read from chain {CHAIN.id}</span>
      </div>
      <ul className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <li className="flex flex-col gap-1 px-5 py-4">
          <span className="mono-label">ETH</span>
          <span className="mono text-[22px] text-ink" data-testid="live-eth">
            {cell(facts?.ethUsd ? fmtUsd(facts.ethUsd) : null)}
          </span>
          <span className="text-[12px] text-muted">{fresh !== null ? `Chainlink ETH/USD · updated ${fresh < 3600 ? `${Math.floor(fresh / 60)} min` : `${Math.floor(fresh / 3600)} h`} ago` : "Chainlink ETH/USD"}</span>
        </li>
        <li className="flex flex-col gap-1 px-5 py-4">
          <span className="mono-label">Block</span>
          <span className="mono text-[22px] text-ink" data-testid="live-block">
            {facts?.block ? (
              <a href={explorerBlock(facts.block)} target="_blank" rel="noreferrer noopener" className="transition-colors hover:text-lift">
                {fmtInt(facts.block)}
              </a>
            ) : (
              cell(null)
            )}
          </span>
          <span className="text-[12px] text-muted">{facts?.blockPace ? `about ${facts.blockPace.toFixed(2)} s per block` : "chain head"}</span>
        </li>
        <li className="flex flex-col gap-1 px-5 py-4">
          <span className="mono-label">Gas</span>
          <span className="mono text-[22px] text-ink" data-testid="live-gas">
            {cell(facts?.gasGwei !== null && facts?.gasGwei !== undefined ? `${facts.gasGwei.toFixed(facts.gasGwei < 0.1 ? 4 : 2)} gwei` : null)}
          </span>
          <span className="text-[12px] text-muted">what a proof submission pays for, nothing else</span>
        </li>
      </ul>
    </div>
  );
}

/** The line above the hero headline: live totals once the book is deployed, its honest state before. */
export function HeroStatus() {
  const { facts } = useChain();
  const b = facts?.book;
  if (!b) return <p className="mono-label" data-testid="hero-status">Proofs run in your browser today · group book not deployed yet</p>;
  return (
    <p className="mono-label" data-testid="hero-status">
      {b.groups ?? "—"} groups on {CHAIN.name} · {b.commitments ?? "—"} commitments · {b.proofs ?? "—"} proofs accepted
    </p>
  );
}
