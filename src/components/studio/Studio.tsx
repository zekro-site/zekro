"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useChain } from "@/components/providers/ChainProvider";
import { CopyValue, useCopy } from "@/components/site/CaCopy";
import { ArrowRight, CopyIcon, CheckIcon } from "@/components/site/Icons";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { CHAIN, explorerTx, shortAddress } from "@/config/brand";
import { CONTRACTS, bookLive } from "@/config/contracts";
import { REFUSAL_WORDS } from "@/lib/abi";
import { PRACTICE_ADMIN, SCOPE_OPEN, STATUS, STATUS_NAMES, emptyPractice, parseCommitments, practice, rootMatchesList, usableRoots, type GroupDetail, type GroupView, type PracticeState } from "@/lib/book";
import { listGroups, loadGroup, precheck, rolesOf, write } from "@/lib/book-chain";
import { explain, waitForReceipt } from "@/lib/client";
import { PRACTICE_KEY, saveLastBundle, useIdentities } from "@/lib/studio-store";
import { proveMembership, verifyMembership } from "@/lib/zk/prover-client";
import { commitmentOf, decodeIdentity, makeBundle, rootOf, signalOf, toHex32, type ProofBundle } from "@/lib/zk/core";

/*
 * The studio. One screen with five tabs, each tab a real step. Live mode writes to ZekroGroupBook through the connected wallet.
 * Practice mode (no address in src/config/contracts.ts) follows the same rules with the book kept in this browser.
 * Proofs are real in both modes. The right card lists what each action puts on the public record.
 */

type TabKey = "group" | "members" | "root" | "prove" | "identity";
const TABS: { key: TabKey; label: string }[] = [
  { key: "group", label: "Group" },
  { key: "members", label: "Members" },
  { key: "root", label: "Root + scopes" },
  { key: "prove", label: "Prove" },
  { key: "identity", label: "Identity" },
];

type Trail = { id: number; at: string; title: string; detail: string; chain: boolean; tx?: string };
type LiveProof = { bundle: ProofBundle; groupId: number; scopeId: number; rootSeq: number; ms: number; verifyMs: number; valid: boolean };

const short = (v: bigint | string) => {
  const h = typeof v === "bigint" ? toHex32(v) : v;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
};
const when = (s: number) => (s ? new Date(s * 1000).toLocaleString() : "—");

export function Studio() {
  const live = bookLive();
  const wallet = useWallet();
  const { open } = useWalletModal();
  const { facts } = useChain();
  const ids = useIdentities();
  const [store, setStore] = useLocalStore<PracticeState>(PRACTICE_KEY, emptyPractice());
  const [tab, setTab] = useState<TabKey>("group");
  const [groups, setGroups] = useState<GroupView[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [chainDetail, setChainDetail] = useState<GroupDetail | null>(null);
  const [roles, setRoles] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trail, setTrail] = useState<Trail[]>([]);

  const state: PracticeState = store && store.v === 1 ? store : emptyPractice();
  const shownGroups = useMemo(() => (live ? groups : practice.list(state)), [live, groups, state]);
  const detail: GroupDetail | null = useMemo(() => (selected === null ? null : live ? chainDetail : practice.detail(state, selected)), [live, selected, chainDetail, state]);

  const note = useCallback((title: string, detailText: string, chain: boolean, tx?: string) => {
    setTrail((t) => [{ id: Date.now() + Math.random(), at: new Date().toLocaleTimeString(), title, detail: detailText, chain, tx }, ...t].slice(0, 30));
  }, []);

  const refresh = useCallback(async () => {
    if (!live) return;
    const list = await listGroups();
    setGroups(list);
  }, [live]);
  const reloadGroup = useCallback(
    async (id: number) => {
      if (!live) return;
      setChainDetail(await loadGroup(id));
    },
    [live],
  );

  useEffect(() => {
    if (!live) return;
    let off = false;
    listGroups()
      .then((g) => {
        if (!off) setGroups(g);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [live]);

  useEffect(() => {
    if (!live || selected === null) return;
    let off = false;
    loadGroup(selected)
      .then((d) => {
        if (!off) setChainDetail(d);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [live, selected]);

  useEffect(() => {
    if (!live || selected === null || !wallet.address) return;
    let off = false;
    rolesOf(selected, wallet.address)
      .then((r) => {
        if (!off) setRoles(Number(r));
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [live, selected, wallet.address, chainDetail]);

  /** Runs one action, in plain words on failure. */
  const act = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(null);
    }
  };

  /** Sends one book write from the connected wallet, waits for its receipt, then rereads. */
  const send = async (fn: string, args: readonly unknown[], title: string, detailText: string) => {
    if (!wallet.address) {
      open();
      throw new Error("Connect a wallet first.");
    }
    if (!wallet.onRobinhoodChain) await wallet.switchNetwork();
    const hash = await wallet.sendTransaction({ to: CONTRACTS.book, data: write(fn, args) });
    const receipt = await waitForReceipt(hash);
    if (!receipt.ok) throw new Error(`The transaction reverted: ${hash}`);
    note(title, detailText, true, hash);
    await refresh();
    if (selected !== null) await reloadGroup(selected);
    wallet.refreshBalance();
    return hash;
  };

  const now = () => Math.floor(Date.now() / 1000);
  const g = detail?.group ?? null;
  const isAdmin = !live || (g !== null && Boolean(wallet.address) && g.admin.toLowerCase() === wallet.address?.toLowerCase());
  const canCurate = isAdmin || (roles & 1) !== 0;
  const canKeep = isAdmin || (roles & 2) !== 0;
  const liveNeedsWallet = live && !wallet.address;

  const body = (() => {
    switch (tab) {
      case "group":
        return <GroupTab live={live} groups={shownGroups} selected={selected} detail={detail} isAdmin={isAdmin} busy={busy} walletAddress={wallet.address}
          onSelect={(id) => { setSelected(id); setError(null); }}
          onCreate={(name, openEnrollment) => act("Creating the group", async () => {
            if (live) {
              await send("createGroup", [name, `0x${"0".repeat(64)}`, openEnrollment], `Group created: ${name}`, "Public: its name, its admin wallet, its enrollment rule.");
              const list = await listGroups();
              if (list[0]) setSelected(list[0].id);
            } else {
              const r = practice.create(state, name, openEnrollment, now());
              setStore(r.state);
              setSelected(r.id);
              note(`Practice group: ${name}`, "Kept in this browser. On chain, the name and admin wallet would be public.", false);
            }
          })}
          onStatus={(to) => selected !== null && act("Changing the status", async () => {
            if (live) await send(to === "pause" ? "pauseGroup" : to === "resume" ? "resumeGroup" : "retireGroup", [BigInt(selected)], `Group ${to}d`, "Public: the new status and the admin wallet.");
            else { setStore(practice.setStatus(state, selected, to)); note(`Practice group ${to}d`, "Kept in this browser.", false); }
          })}
          onRoles={(account, mask) => selected !== null && act("Setting roles", async () => {
            await send("setRoles", [BigInt(selected), account, mask], `Roles set for ${shortAddress(account)}`, "Public: the address and its roles in this group.");
          })}
        />;
      case "members":
        return <MembersTab live={live} detail={detail} canCurate={canCurate} busy={busy} identities={ids.list}
          onAdd={(list) => selected !== null && act("Adding commitments", async () => {
            if (live) await send("addCommitments", [BigInt(selected), list], `${list.length} commitment${list.length === 1 ? "" : "s"} added`, "Public: each commitment and the wallet that sent them. A wallet that adds its own commitment links itself to it.");
            else { setStore(practice.add(state, selected, list)); note(`${list.length} practice commitment${list.length === 1 ? "" : "s"} added`, "Kept in this browser.", false); }
          })}
          onClear={(index) => selected !== null && act("Clearing the leaf", async () => {
            if (live) await send("clearCommitment", [BigInt(selected), index], `Leaf ${index} cleared`, "Public: which leaf was cleared. Publish a new root and revoke the old ones to finish the removal.");
            else { setStore(practice.clear(state, selected, index)); note(`Practice leaf ${index} cleared`, "Kept in this browser. Publish a new root next.", false); }
          })}
        />;
      case "root":
        return <RootTab detail={detail} canCurate={canCurate} canKeep={canKeep} isAdmin={isAdmin} busy={busy}
          onPublish={() => detail && act("Publishing the root", async () => {
            const root = rootOf(detail.leaves);
            if (live) await send("publishRoot", [BigInt(detail.group.id), root, detail.group.digest], `Root published: ${short(root)}`, "Public: the root, the list digest it came from and the curator's wallet.");
            else { setStore(practice.publish(state, detail.group.id, root, detail.group.digest, now())); note(`Practice root: ${short(root)}`, "Kept in this browser.", false); }
          })}
          onRevoke={(seq) => detail && act("Revoking the root", async () => {
            if (live) await send("revokeRoot", [BigInt(detail.group.id), BigInt(seq)], `Root ${seq} revoked`, "Public: which root and the admin's wallet.");
            else { setStore(practice.revoke(state, detail.group.id, seq)); note(`Practice root ${seq} revoked`, "Kept in this browser.", false); }
          })}
          onOpenScope={(label, closesAt) => detail && act("Opening the scope", async () => {
            if (live) await send("openScope", [BigInt(detail.group.id), label, BigInt(closesAt)], `Scope opened: ${label}`, "Public: its label, closing time and the keeper's wallet.");
            else { setStore(practice.openScope(state, detail.group.id, label, closesAt, now())); note(`Practice scope: ${label}`, "Kept in this browser.", false); }
          })}
          onCloseScope={(sid) => detail && act("Closing the scope", async () => {
            if (live) await send("closeScope", [BigInt(detail.group.id), BigInt(sid)], `Scope ${sid} closed`, "Public: which scope and the keeper's wallet.");
            else { setStore(practice.closeScope(state, detail.group.id, sid)); note(`Practice scope ${sid} closed`, "Kept in this browser.", false); }
          })}
        />;
      case "prove":
        return <ProveTab live={live} detail={detail} identities={ids.list} walletAddress={wallet.address} note={note} setError={setError}
          onRecord={async (p) => {
            if (live) {
              const word = await precheck(p.groupId, p.scopeId, p.rootSeq, BigInt(p.bundle.nullifier), BigInt(p.bundle.signal), p.bundle.proof);
              if (word !== "None") throw new Error(REFUSAL_WORDS[word]);
              await send("submitProof", [BigInt(p.groupId), BigInt(p.scopeId), BigInt(p.rootSeq), BigInt(p.bundle.nullifier), BigInt(p.bundle.signal), p.bundle.proof, p.bundle.message.slice(0, 256)], "Proof accepted on chain", `Public: your sending wallet ${shortAddress(wallet.address ?? "")}, the root, the scope, the nullifier and the message. Not public: which leaf is yours.`);
            } else {
              setStore(practice.record(state, p.groupId, p.scopeId, p.rootSeq, BigInt(p.bundle.nullifier), now()));
              note("Practice proof recorded", "Checked with the real key, recorded in this browser. On chain, the sending wallet would be public too.", false);
            }
          }}
        />;
      case "identity":
        return <IdentityTab store={ids} note={note} />;
    }
  })();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill" data-testid="studio-mode">
            <span className={`dot ${live ? "dot-live" : "!bg-warn"}`} />
            {live ? "group book live" : "practice mode"}
          </span>
          <span className="pill">
            <span className="dot dot-live" />
            prover in this tab
          </span>
          <span className="pill">
            <span className={`dot ${facts?.block ? "dot-live" : "dot-off"}`} />
            {facts?.block ? `chain ${CHAIN.id} · block ${facts.block.toLocaleString("en-US")}` : `chain ${CHAIN.id}`}
          </span>
        </div>
      </div>
      {!live ? (
        <p className="limit mt-4" data-testid="studio-practice-note">
          <strong>Practice mode.</strong> The contracts are not deployed yet. Your proofs here are real and checked with the real key, while the book is kept in this browser and nothing is sent.
        </p>
      ) : null}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Studio steps">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setError(null); }} data-testid={`tab-${t.key}`} className={`-mb-px border-b-2 px-4 py-3 text-[14px] whitespace-nowrap transition-colors ${tab === t.key ? "border-lift text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.22fr]">
        <div className="card flex min-w-0 flex-col gap-6 p-6 md:p-7">
          {liveNeedsWallet && tab !== "identity" && tab !== "prove" ? <p className="text-[13px] text-muted">Reading needs no wallet. To write, connect one with the button at the top.</p> : null}
          {body}
          {busy ? <p className="flex items-center gap-2 text-[13px] text-muted"><span className="spin !border-line-2 !border-t-lift" />{busy}{live ? " · check your wallet" : ""}</p> : null}
          {error ? <p className="alert" role="alert" data-testid="studio-error">{error}</p> : null}
        </div>
        <div className="card flex min-h-[560px] min-w-0 flex-col p-6 md:p-7">
          <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
            <p className="mono-label">What goes on the record</p>
            <span className="mono text-[12px] text-faint">{trail.length ? `${trail.length} this visit` : "idle"}</span>
          </div>
          {trail.length === 0 ? (
            <div className="flex flex-1 items-center">
              <p className="max-w-[40ch] text-[15px] leading-[1.5] text-muted">Every action you take appears here, with what it makes public. Anything that reaches the chain carries a mark. Your secret and your salt never appear, because they never leave this tab.</p>
            </div>
          ) : (
            <ol className="flex flex-col" data-testid="studio-trail">
              {trail.map((t) => (
                <li key={t.id} className="flex flex-col gap-1 border-b border-line py-4 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`pill !py-0.5 !text-[10px] ${t.chain ? "" : "pill-warn"}`}>{t.chain ? "on chain" : "this browser"}</span>
                    <span className="text-[15px] text-ink">{t.title}</span>
                  </div>
                  <p className="text-[13px] leading-[1.5] text-muted">{t.detail}</p>
                  <p className="mono text-[11px] text-faint">
                    {t.at}
                    {t.tx ? (
                      <>
                        {" · "}
                        <a href={explorerTx(t.tx)} target="_blank" rel="noreferrer noopener" className="hover:text-lift">
                          {short(t.tx)}
                        </a>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <p className="mt-5 text-[12px] text-faint">Chain {CHAIN.id}. No sign-up. Identities live in this browser alone. A proof covers only the circuit&apos;s statement: wallet address, IP, network metadata and transaction activity can stay visible.</p>
    </>
  );
}

/* ------------------------------------------------------------------ small parts */

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mono-label mb-2 block">
      {children}
    </label>
  );
}

function NeedGroup() {
  return <p className="body text-muted" data-testid="need-group">Pick or create a group on the Group tab first.</p>;
}

function GroupTab(p: {
  live: boolean;
  groups: GroupView[];
  selected: number | null;
  detail: GroupDetail | null;
  isAdmin: boolean;
  busy: string | null;
  walletAddress: string | null;
  onSelect: (id: number) => void;
  onCreate: (name: string, openEnrollment: boolean) => void;
  onStatus: (to: "pause" | "resume" | "retire") => void;
  onRoles: (account: string, mask: number) => void;
}) {
  const [name, setName] = useState("");
  const [enroll, setEnroll] = useState(false);
  const [account, setAccount] = useState("");
  const [curator, setCurator] = useState(true);
  const [keeper, setKeeper] = useState(false);
  const g = p.detail?.group;
  const adminLine = g ? (g.admin === PRACTICE_ADMIN ? g.admin : shortAddress(g.admin)) : "";
  return (
    <>
      <div>
        <Label htmlFor="group-pick">Your group</Label>
        <select id="group-pick" className="field" value={p.selected ?? ""} onChange={(e) => e.target.value && p.onSelect(Number(e.target.value))} data-testid="group-pick">
          <option value="">{p.groups.length ? "Choose a group" : "No groups yet"}</option>
          {p.groups.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id}. {x.name} ({x.leafCount} members)
            </option>
          ))}
        </select>
      </div>
      {g ? (
        <div className="well flex flex-col gap-2" data-testid="group-facts">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] text-ink">{g.name}</span>
            <span className={`pill !py-0.5 ${g.status === STATUS.Active ? "" : "pill-warn"}`} data-testid="group-status">{STATUS_NAMES[g.status]}</span>
          </div>
          <p className="text-[13px] text-muted">Admin {adminLine} · {g.leafCount} commitments · {g.rootCount} roots · {g.scopeCount} scopes · {g.openEnrollment ? "open enrollment" : "curators add members"}</p>
          {p.isAdmin && g.status !== STATUS.Retired ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {g.status === STATUS.Active ? <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(p.busy)} onClick={() => p.onStatus("pause")}>Pause</button> : null}
              {g.status === STATUS.Paused ? <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(p.busy)} onClick={() => p.onStatus("resume")}>Resume</button> : null}
              <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(p.busy)} onClick={() => p.onStatus("retire")}>Retire for good</button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="hairline-x" />
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="group-name">Create a group</Label>
          <input id="group-name" className="field" maxLength={32} placeholder="Readers of the first edition" value={name} onChange={(e) => setName(e.target.value)} data-testid="group-name" />
          <p className="field-note">Up to 32 plain characters. {p.live ? "Public forever." : "On chain this would be public forever."}</p>
        </div>
        <label className="flex items-start gap-3 text-[14px] text-ink2">
          <input type="checkbox" className="mt-1" checked={enroll} onChange={(e) => setEnroll(e.target.checked)} />
          <span>
            Open enrollment
            <span className="field-note !mt-0.5 block">Anyone can add a commitment. The admin still decides which root counts. Without it, only curators add.</span>
          </span>
        </label>
        <button type="button" className="btn btn-light w-full justify-center" disabled={Boolean(p.busy) || !name.trim()} onClick={() => { p.onCreate(name.trim(), enroll); setName(""); }} data-testid="group-create">
          <span>{p.live ? "Create in the book" : "Create in practice"}</span>
          <ArrowRight size={15} />
        </button>
      </div>
      {p.live && g && p.isAdmin ? (
        <>
          <div className="hairline-x" />
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="role-account">Roles in this group</Label>
              <input id="role-account" className="field mono !text-[13px]" placeholder="0x…" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-4 text-[14px] text-ink2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={curator} onChange={(e) => setCurator(e.target.checked)} /> Curator</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={keeper} onChange={(e) => setKeeper(e.target.checked)} /> Scope keeper</label>
            </div>
            <button type="button" className="btn btn-ghost btn-sm self-start" disabled={Boolean(p.busy) || !/^0x[0-9a-fA-F]{40}$/.test(account)} onClick={() => p.onRoles(account, (curator ? 1 : 0) | (keeper ? 2 : 0))}>Set roles</button>
          </div>
        </>
      ) : null}
    </>
  );
}

function MembersTab(p: { live: boolean; detail: GroupDetail | null; canCurate: boolean; busy: string | null; identities: { label: string; backup: string }[]; onAdd: (list: bigint[]) => void; onClear: (index: number) => void }) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState<string | null>(null);
  if (!p.detail) return <NeedGroup />;
  const { group: g, leaves } = p.detail;
  const canAdd = p.canCurate || g.openEnrollment;
  const add = () => {
    try {
      const list = parseCommitments(text);
      if (!list.length) throw new Error("Paste at least one commitment.");
      if (list.length > 128) throw new Error("At most 128 commitments at once.");
      setBad(null);
      p.onAdd(list);
      setText("");
    } catch (e) {
      setBad(e instanceof Error ? e.message : "Those commitments could not be read.");
    }
  };
  const addMine = (backup: string) => setText((t) => `${t ? `${t}\n` : ""}${toHex32(commitmentOf(decodeIdentity(backup)))}`);
  return (
    <>
      <div>
        <Label htmlFor="commitments">Add commitments</Label>
        <textarea id="commitments" className="field mono !text-[13px]" rows={5} spellCheck={false} placeholder={"0x1f…\n0x2a…"} value={text} onChange={(e) => setText(e.target.value)} data-testid="commitments" />
        <p className="field-note">One per line. A commitment reveals nothing by itself, but {p.live ? "the wallet that adds it is public. If it is your own wallet and your own commitment, that links the two." : "on chain, the wallet that adds it would be public."}</p>
        {p.identities.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted">Fill from this browser:</span>
            {p.identities.map((i) => (
              <button key={i.backup} type="button" className="pill cursor-pointer !py-0.5 hover:border-lift" onClick={() => addMine(i.backup)} data-testid="fill-identity">
                {i.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="field-note">No identity yet? Make one on the Identity tab.</p>
        )}
      </div>
      {bad ? <p className="alert" role="alert">{bad}</p> : null}
      <button type="button" className="btn btn-light w-full justify-center" disabled={Boolean(p.busy) || !text.trim() || !canAdd} onClick={add} data-testid="commitments-add">
        <span>{canAdd ? "Add to the list" : "Only a curator can add here"}</span>
        <ArrowRight size={15} />
      </button>
      <div>
        <p className="mono-label mb-2">List · {leaves.length} of 65,536</p>
        {leaves.length === 0 ? (
          <p className="text-[13px] text-muted">Empty so far.</p>
        ) : (
          <ol className="flex max-h-[280px] flex-col overflow-y-auto" data-testid="leaf-list">
            {leaves.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
                <span className="mono text-[12px] text-muted">{String(i).padStart(3, "0")}</span>
                <span className={`mono min-w-0 flex-1 truncate text-[12px] ${l === 0n ? "text-faint" : "text-ink2"}`}>{l === 0n ? "cleared" : short(l)}</span>
                {l !== 0n && p.canCurate ? (
                  <button type="button" className="text-[12px] text-muted transition-colors hover:text-bad" disabled={Boolean(p.busy)} onClick={() => p.onClear(i)} data-testid={`clear-${i}`}>
                    Clear
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function RootTab(p: { detail: GroupDetail | null; canCurate: boolean; canKeep: boolean; isAdmin: boolean; busy: string | null; onPublish: () => void; onRevoke: (seq: number) => void; onOpenScope: (label: string, closesAt: number) => void; onCloseScope: (id: number) => void }) {
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState("");
  const computed = useMemo(() => (p.detail ? rootOf(p.detail.leaves) : 0n), [p.detail]);
  if (!p.detail) return <NeedGroup />;
  const { group: g, roots, scopes, leaves } = p.detail;
  const latest = roots.at(-1);
  const status = rootMatchesList(latest, computed, g.digest);
  const present = leaves.filter((l) => l !== 0n).length;
  return (
    <>
      <div className="well flex flex-col gap-2">
        <p className="mono-label">Root of the list as it stands</p>
        <p className="mono wrapline text-[12px] text-ink2" data-testid="computed-root">{toHex32(computed)}</p>
        <p className="text-[13px] text-muted" data-testid="root-status">
          {status === "match" ? `The latest root (${latest?.seq}) matches this list.` : status === "mismatch" ? "The latest root does NOT match this list. Publish a correct one." : status === "older-list" ? "The list changed after the latest root. Publish again so new members can prove." : "No root yet. A group goes Active on its first root."}
        </p>
        <p className="text-[12px] text-faint">Computed in this tab from {present} commitment{present === 1 ? "" : "s"}, Poseidon over BN254, depth 16.</p>
      </div>
      <button type="button" className="btn btn-light w-full justify-center" disabled={Boolean(p.busy) || !p.canCurate || present === 0 || status === "match" || g.status === STATUS.Retired} onClick={p.onPublish} data-testid="root-publish">
        <span>{p.canCurate ? "Publish this root" : "Only a curator can publish"}</span>
        <ArrowRight size={15} />
      </button>
      {roots.length ? (
        <div>
          <p className="mono-label mb-2">Root history</p>
          <ol className="flex flex-col" data-testid="root-history">
            {[...roots].reverse().slice(0, 6).map((r) => (
              <li key={r.seq} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                <span className="mono text-[12px] text-ink2">{r.seq}. {short(r.root)}</span>
                <span className="text-[12px] text-muted">{r.leafCount} leaves · {when(r.publishedAt)}</span>
                {r.revoked ? <span className="text-[12px] text-warn">revoked</span> : p.isAdmin ? <button type="button" className="text-[12px] text-muted hover:text-bad" disabled={Boolean(p.busy)} onClick={() => p.onRevoke(r.seq)}>Revoke</button> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="hairline-x" />
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="scope-label">Open a scope</Label>
          <input id="scope-label" className="field" maxLength={64} placeholder="Spring vote" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="scope-label" />
        </div>
        <div>
          <Label htmlFor="scope-hours">Closes in hours (optional)</Label>
          <input id="scope-hours" className="field" inputMode="numeric" placeholder="Leave empty for no closing time" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} />
          <p className="field-note">One proof per member per scope.</p>
        </div>
        <button type="button" className="btn btn-ghost w-full justify-center" disabled={Boolean(p.busy) || !p.canKeep || !label.trim()} onClick={() => { p.onOpenScope(label.trim(), hours ? Math.floor(Date.now() / 1000) + Number(hours) * 3600 : 0); setLabel(""); setHours(""); }} data-testid="scope-open">
          {p.canKeep ? "Open scope" : "Only a scope keeper can open"}
        </button>
        {scopes.length ? (
          <ol className="flex flex-col" data-testid="scope-list">
            {scopes.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
                <span className="min-w-0 truncate text-[14px] text-ink2">{s.id}. {s.label}</span>
                <span className="flex-none text-[12px] text-muted">
                  {s.proofs} proofs · {s.status === SCOPE_OPEN ? (s.closesAt ? `until ${when(s.closesAt)}` : "open") : "closed"}{" "}
                  {s.status === SCOPE_OPEN && p.canKeep ? <button type="button" className="ml-1 text-muted hover:text-bad" disabled={Boolean(p.busy)} onClick={() => p.onCloseScope(s.id)}>Close</button> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </>
  );
}

function ProveTab(p: { live: boolean; detail: GroupDetail | null; identities: { label: string; backup: string }[]; walletAddress: string | null; note: (t: string, d: string, c: boolean) => void; setError: (e: string | null) => void; onRecord: (x: LiveProof) => Promise<void> }) {
  const [idIndex, setIdIndex] = useState(0);
  const [scopeId, setScopeId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [proofState, setProofState] = useState<LiveProof | null>(null);
  const [recorded, setRecorded] = useState(false);
  const { copied, copy } = useCopy(proofState ? JSON.stringify(proofState.bundle) : "");
  if (!p.detail) return <NeedGroup />;
  const { group: g, leaves, scopes } = p.detail;
  const open = scopes.filter((s) => s.status === SCOPE_OPEN);
  const scope = open.find((s) => s.id === scopeId) ?? open[0];
  const roots = usableRoots(p.detail);
  const root = roots[0];
  const chosen = p.identities[idIndex] ?? p.identities[0];
  const identity = chosen ? decodeIdentity(chosen.backup) : null;
  const commitment = identity ? commitmentOf(identity) : null;
  const listed = commitment !== null && leaves.includes(commitment);
  const rootCurrent = root ? root.root === rootOf(leaves) : false;
  const blocked = !identity ? "Make an identity on the Identity tab." : !listed ? "This identity's commitment is not in this list." : !root ? "This group has no usable root yet." : !rootCurrent ? "The newest root does not match the current list. A curator has to publish again." : !scope ? "This group has no open scope. Open one on the Root tab." : g.status !== STATUS.Active ? "This group is not active." : null;

  const prove = async () => {
    if (!identity || !scope || !root) return;
    setBusy("Loading the prover, then proving in this tab. It may take a while on the first run.");
    setProofState(null);
    setRecorded(false);
    p.setError(null);
    try {
      const signal = signalOf(message);
      const out = await proveMembership(identity, leaves, scope.field, signal);
      const check = await verifyMembership(out.proof, out.values);
      const bundle = makeBundle(out.proof, out.values, message, { ms: out.ms, book: { address: p.live ? CONTRACTS.book : "practice", groupId: String(g.id), scopeId: String(scope.id), rootSeq: String(root.seq) } });
      saveLastBundle(bundle);
      setProofState({ bundle, groupId: g.id, scopeId: scope.id, rootSeq: root.seq, ms: out.ms, verifyMs: check.ms, valid: check.valid });
      p.note("Proof made", `Made in this tab in ${(out.ms / 1000).toFixed(1)} s. Nothing was sent. The nullifier for this scope is ${short(out.values.nullifier)}.`, false);
    } catch (e) {
      p.setError(explain(e));
    } finally {
      setBusy(null);
    }
  };
  const record = async () => {
    if (!proofState) return;
    setBusy(p.live ? "Sending from your wallet" : "Recording in this browser");
    p.setError(null);
    try {
      await p.onRecord(proofState);
      setRecorded(true);
    } catch (e) {
      p.setError(explain(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="prove-identity">Identity</Label>
          <select id="prove-identity" className="field" value={idIndex} onChange={(e) => setIdIndex(Number(e.target.value))} data-testid="prove-identity">
            {p.identities.length === 0 ? <option>None in this browser</option> : p.identities.map((i, n) => <option key={i.backup} value={n}>{i.label}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="prove-scope">Scope</Label>
          <select id="prove-scope" className="field" value={scope?.id ?? ""} onChange={(e) => setScopeId(Number(e.target.value))} data-testid="prove-scope">
            {open.length === 0 ? <option value="">None open</option> : open.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="prove-message">Message</Label>
        <input id="prove-message" className="field" maxLength={256} placeholder="I vote for option B" value={message} onChange={(e) => setMessage(e.target.value)} data-testid="prove-message" />
        <p className="field-note">The proof is tied to this exact text. It is public; do not put anything personal in it.</p>
      </div>
      <div className="well flex flex-col gap-1.5 text-[13px]">
        <div className="flex justify-between gap-3"><span className="text-muted">Group</span><span className="truncate text-ink2">{g.name}</span></div>
        <div className="flex justify-between gap-3"><span className="text-muted">Root</span><span className="mono text-[12px] text-ink2">{root ? `${root.seq}. ${short(root.root)}` : "—"}</span></div>
        <div className="flex justify-between gap-3"><span className="text-muted">Your commitment</span><span className={`mono text-[12px] ${listed ? "text-good" : "text-ink2"}`}>{commitment ? (listed ? "on the list" : "not on the list") : "—"}</span></div>
        <div className="flex justify-between gap-3"><span className="text-muted">Hidden among</span><span className="mono text-[12px] text-ink2" data-testid="hidden-among">{leaves.filter((l) => l !== 0n).length} commitments</span></div>
      </div>
      {blocked ? <p className="text-[13px] text-warn" data-testid="prove-blocked">{blocked}</p> : null}
      <button type="button" className="btn btn-light w-full justify-center" disabled={Boolean(busy) || Boolean(blocked)} onClick={prove} data-testid="studio-prove">
        {busy ? <span className="spin" /> : null}
        <span>{busy ? "Working" : "Prove in this tab"}</span>
        {busy ? null : <ArrowRight size={15} />}
      </button>
      {busy ? <p className="text-[13px] text-muted">{busy}</p> : null}
      {proofState ? (
        <div className="flex flex-col gap-3" data-testid="studio-proof">
          <p className={proofState.valid ? "ok-note" : "alert"} data-testid="studio-proof-valid">
            {proofState.valid ? `Valid against this group's root ${proofState.rootSeq}${p.live ? "" : " in your practice book, which only this browser knows"}. Proof ${(proofState.ms / 1000).toFixed(1)} s and check ${(proofState.verifyMs / 1000).toFixed(1)} s on this device.` : "The check failed for this proof."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={copy} data-testid="studio-copy-bundle">
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              <span>{copied ? "Copied" : "Copy bundle"}</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy) || recorded || !proofState.valid} onClick={record} data-testid="studio-record">
              <span>{recorded ? "Recorded" : p.live ? "Submit to the book" : "Record in practice"}</span>
            </button>
            <Link href="/review" className="btn btn-ghost btn-sm">
              <span>Review it</span>
            </Link>
          </div>
          {p.live ? (
            <p className="limit">
              <strong>Before you submit:</strong> the wallet that sends this {p.walletAddress ? `(${shortAddress(p.walletAddress)}) ` : ""}is public and stays linked to this proof. The proof does not hide it. Any wallet can send it.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function IdentityTab({ store, note }: { store: ReturnType<typeof useIdentities>; note: (t: string, d: string, c: boolean) => void }) {
  const [label, setLabel] = useState("");
  const [restore, setRestore] = useState("");
  const [bad, setBad] = useState<string | null>(null);
  return (
    <>
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="identity-label">Make an identity</Label>
          <input id="identity-label" className="field" maxLength={40} placeholder="A name only you see" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="identity-label" />
          <p className="field-note">Your browser draws a secret and a salt. They stay in this browser&apos;s storage and are never sent. Make a new identity per group if you do not want your groups linked.</p>
        </div>
        <button type="button" className="btn btn-light w-full justify-center" onClick={() => { store.create(label); setLabel(""); note("Identity made", "Stored in this browser only. Nothing was sent.", false); }} data-testid="identity-create">
          <span>Make an identity</span>
          <ArrowRight size={15} />
        </button>
      </div>
      <div>
        <p className="mono-label mb-2">In this browser</p>
        {store.list.length === 0 ? (
          <p className="text-[13px] text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col" data-testid="identity-list">
            {store.list.map((i) => (
              <IdentityRow key={i.backup} label={i.label} backup={i.backup} onRemove={() => store.remove(i.backup)} />
            ))}
          </ul>
        )}
      </div>
      <div className="hairline-x" />
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="identity-restore">Restore a backup</Label>
          <input id="identity-restore" className="field mono !text-[13px]" autoComplete="off" spellCheck={false} placeholder="zekro-id-1:0x…:0x…" value={restore} onChange={(e) => setRestore(e.target.value)} data-testid="identity-restore" />
        </div>
        {bad ? <p className="alert" role="alert">{bad}</p> : null}
        <button type="button" className="btn btn-ghost w-full justify-center" disabled={!restore.trim()} onClick={() => { try { store.restore("Restored", restore); setRestore(""); setBad(null); } catch (e) { setBad(e instanceof Error ? e.message : "That backup could not be read."); } }} data-testid="identity-restore-go">
          Restore
        </button>
      </div>
    </>
  );
}

function IdentityRow({ label, backup, onRemove }: { label: string; backup: string; onRemove: () => void }) {
  const [show, setShow] = useState(false);
  const commitment = toHex32(commitmentOf(decodeIdentity(backup)));
  const { copied, copy } = useCopy(backup);
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[14px] text-ink">{label}</span>
        <span className="flex flex-none items-center gap-3 text-[12px]">
          <button type="button" className="text-muted hover:text-ink" onClick={() => setShow((v) => !v)} data-testid="identity-backup-toggle">{show ? "Hide backup" : "Backup"}</button>
          <button type="button" className="text-muted hover:text-bad" onClick={() => { if (window.confirm("Delete this identity from this browser? Without a backup that membership is gone.")) onRemove(); }}>Delete</button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        Commitment <CopyValue value={commitment} />
      </div>
      {show ? (
        <div className="limit flex flex-col gap-2" data-testid="identity-backup">
          <p><strong>Anyone with this line can prove as you.</strong> Keep it offline. Nobody can restore it for you if it is lost.</p>
          <p className="mono wrapline text-[11px]">{backup}</p>
          <button type="button" className="btn btn-ghost btn-sm self-start" onClick={copy}>{copied ? "Copied" : "Copy backup"}</button>
        </div>
      ) : null}
    </li>
  );
}
