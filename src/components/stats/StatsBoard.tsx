"use client";

import { useEffect, useState } from "react";
import { useChain } from "@/components/providers/ChainProvider";
import { CHAIN, explorerAddress } from "@/config/brand";
import { CONTRACTS, CONTRACT_NAMES, bookLive } from "@/config/contracts";
import { STATUS_NAMES, type GroupView } from "@/lib/book";
import { listGroups } from "@/lib/book-chain";
import { fmtInt, fmtUsd } from "@/lib/format";

/* Everything here comes from the chain, on this page's own schedule. Numbers that do not exist yet read "—". */

const toneOf = (s: number) => (s === 1 ? "text-good" : s === 3 ? "text-faint" : s === 2 ? "text-warn" : "text-muted");

export function StatsBoard() {
  const { facts, failed } = useChain();
  const [groups, setGroups] = useState<GroupView[] | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const live = bookLive();

  useEffect(() => {
    if (!live) return;
    let off = false;
    const load = () =>
      listGroups()
        .then((g) => {
          if (off) return;
          setGroups(g);
          setReadAt(new Date().toLocaleTimeString());
        })
        .catch(() => !off && setGroups((g) => g ?? []));
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      off = true;
      window.clearInterval(t);
    };
  }, [live]);

  const b = facts?.book;
  const big = (v: number | null | undefined) => (live ? (v === null || v === undefined ? "—" : fmtInt(v)) : "—");
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { k: "Groups", v: big(b?.groups) },
          { k: "Commitments, all groups", v: big(b?.commitments) },
          { k: "Proofs accepted", v: big(b?.proofs) },
        ].map((c) => (
          <div key={c.k} className="card flex flex-col gap-2 p-6">
            <span className="mono-label">{c.k}</span>
            <span className="mono text-[28px] leading-[1.3] text-ink" data-testid={`stat-${c.k.split(",")[0].split(" ")[0].toLowerCase()}`}>
              {c.v}
            </span>
          </div>
        ))}
      </div>
      <div className="card mt-5 overflow-x-auto px-6 py-2 md:px-7">
        <table className="tbl min-w-[640px]" data-testid="stats-groups">
          <thead>
            <tr>
              <th>Group</th>
              <th>Members</th>
              <th>Roots</th>
              <th>Scopes</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {!live ? (
              <tr>
                <td colSpan={5} className="!text-muted">The group book is not deployed yet, so there are no public groups to list. Groups you make in the studio stay in your browser for now.</td>
              </tr>
            ) : groups === null ? (
              <tr>
                <td colSpan={5} className="!text-muted">Reading the book…</td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={5} className="!text-muted">No groups yet. Be the first.</td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g.id}>
                  <td className="whitespace-nowrap">{g.name || `Group ${g.id}`}</td>
                  <td className="mono">{fmtInt(g.leafCount)}</td>
                  <td className="mono">{g.rootCount}</td>
                  <td className="mono">{g.scopeCount}</td>
                  <td className={toneOf(g.status)}>{STATUS_NAMES[g.status] ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="card flex min-w-0 flex-col gap-3 p-6" data-testid="stats-contracts">
          <span className="mono-label">Contracts</span>
          <p className="text-[15px] text-ink2">{live ? "Live. No owner, no fee, no upgrade path, holds no funds." : "Written and tested, not deployed yet."}</p>
          {live ? (
            <>
              <a href={explorerAddress(CONTRACTS.book)} target="_blank" rel="noreferrer noopener" className="mono break-all text-[13px] text-muted transition-colors hover:text-lift">
                {CONTRACT_NAMES.book} {CONTRACTS.book}
              </a>
              <a href={explorerAddress(CONTRACTS.checker)} target="_blank" rel="noreferrer noopener" className="mono break-all text-[13px] text-muted transition-colors hover:text-lift">
                {CONTRACT_NAMES.checker} {CONTRACTS.checker}
              </a>
            </>
          ) : (
            <p className="text-[13px] text-muted">{CONTRACT_NAMES.book} and {CONTRACT_NAMES.checker}. Their addresses appear here once they are live.</p>
          )}
        </div>
        <div className="card flex min-w-0 flex-col gap-3 p-6" data-testid="stats-chain">
          <span className="mono-label">{CHAIN.name}</span>
          <p className="text-[15px] text-ink2">{failed ? "Not reachable from here right now." : facts?.block ? `Block ${fmtInt(facts.block)}` : "Reading…"}</p>
          <p className="text-[13px] text-muted">Gas {facts?.gasGwei !== null && facts?.gasGwei !== undefined ? `${facts.gasGwei.toFixed(4)} gwei` : "—"} · ETH {facts?.ethUsd ? fmtUsd(facts.ethUsd) : "—"} (Chainlink)</p>
          <p className="text-[13px] text-muted">Chain id {CHAIN.id}</p>
        </div>
      </div>
      <p className="mt-5 text-[12px] text-faint">{readAt ? `Read by your browser at ${readAt}. Refreshes every minute.` : "Live chain facts refresh on their own."} No database, no analytics.</p>
    </>
  );
}
