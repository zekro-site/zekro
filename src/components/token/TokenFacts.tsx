"use client";

import { useChain } from "@/components/providers/ChainProvider";
import { BRAND, CHART_PAIR, TOKEN, chartUrl } from "@/config/brand";
import { fmtSupply, usd } from "@/lib/format";

export function TokenFacts() {
  const { facts } = useChain();
  const t = facts?.token;
  const m = facts?.market;
  const rows = [
    ["Name", t?.name ?? (TOKEN.isLive ? "—" : BRAND.name)],
    ["Symbol", t?.symbol ?? BRAND.ticker],
    ["Supply", t ? fmtSupply(t.supply, t.decimals) : "—"],
    ["Price", m?.priceUsd ? usd(m.priceUsd, 8) : "—"],
    ["Liquidity", m?.liquidityUsd ? usd(m.liquidityUsd) : "—"],
  ];
  const chart = TOKEN.isLive ? chartUrl(CHART_PAIR) : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="mono-label">Read from chain</p>
      <table className="tbl" data-testid="token-facts">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="!text-muted">{k}</td>
              <td className="mono text-ink2">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {chart ? (
        <a href={chart} target="_blank" rel="noreferrer noopener" className="btn btn-ghost btn-sm self-start">
          <span>Chart on DEXTools</span>
        </a>
      ) : (
        <p className="text-[13px] text-muted">The chart link appears at launch.</p>
      )}
    </div>
  );
}
