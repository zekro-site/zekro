"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "@/components/site/Icons";
import { CHAIN } from "@/config/brand";
import { bookLive, CONTRACTS } from "@/config/contracts";
import { loadGroup, rootCountOf, rootEntry, scopeEntry } from "@/lib/book-chain";
import { rootMatchesList } from "@/lib/book";
import { readLastBundle } from "@/lib/studio-store";
import { rootAgedOut } from "@/lib/verdict";
import { parseBundle, rootOf, signalOf, type ProofBundle } from "@/lib/zk/core";

/* Shows, value by value, what a proof bundle reveals and what it keeps out. Also rebuilds the group's root from its public list. */

const ROWS: { key: keyof Pick<ProofBundle, "root" | "scope" | "nullifier" | "signal">; name: string; tells: string; doesNot: string }[] = [
  { key: "root", name: "Root", tells: "Which version of the group's list the proof is about.", doesNot: "Which leaf. Every member of that list would produce the same root." },
  { key: "scope", name: "Scope", tells: "The one round, vote or gate this proof is for.", doesNot: "Anything about the member." },
  { key: "nullifier", name: "Nullifier", tells: "This identity already used this scope, if the value appears twice.", doesNot: "The secret or the leaf. Values from two scopes cannot be matched by math alone." },
  { key: "signal", name: "Signal", tells: "The message the proof is tied to. Change the message and the check fails.", doesNot: "Who wrote it." },
];

const NEVER = ["Your secret and your salt", "Your leaf's position in the list", "The Merkle path you walked"];
const STILL = ["The wallet that sends a proof on chain, and its full history", "Your IP address and network metadata, to whoever serves or relays your request", "Transaction timing, gas and habits that can link actions over time", "The fact that you added a commitment, if you added it from your own wallet"];

type RootCheck = { state: "match" | "mismatch" | "older-list" | "none"; leaves: number; computed: string } | null;
type Binding = { tone: "ok" | "warn"; text: string };

/** What the bundle's own root is, in the book. Nothing in the bundle is taken on its word. */
async function bindingOf(b: ProofBundle): Promise<Binding> {
  if (!b.book || b.book.address === "practice") return { tone: "warn", text: `Not tied to any group in the book. Anyone can build a tree of their own, so this root means nothing until you compare it with one you trust: ${b.root}` };
  if (!bookLive()) return { tone: "warn", text: "This site has no deployed book to compare this bundle with, so it is not tied to any group here." };
  if (b.book.address.toLowerCase() !== CONTRACTS.book.toLowerCase()) return { tone: "warn", text: `It names a different contract, ${b.book.address}, which this site cannot vouch for.` };
  const g = Number(b.book.groupId);
  const q = Number(b.book.rootSeq);
  const [r, count, scope] = await Promise.all([rootEntry(g, q), rootCountOf(g), scopeEntry(g, Number(b.book.scopeId))]);
  if (r.root !== BigInt(b.root)) return { tone: "warn", text: `This bundle's root is NOT root ${q} of group ${g}.` };
  if (scope.field !== BigInt(b.scope)) return { tone: "warn", text: `This bundle's scope is NOT scope ${b.book.scopeId} of group ${g}.` };
  if (r.revoked) return { tone: "warn", text: `This is root ${q} of group ${g}, but the admin revoked it. It does not show membership today.` };
  if (rootAgedOut(q, count)) return { tone: "warn", text: `This is root ${q} of group ${g}, but it has aged out of the newest 32. It does not show membership today.` };
  return { tone: "ok", text: `This is root ${q} of group ${g}, still standing in the book.` };
}

export function ReviewDesk() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ProofBundle | null>(null);
  const [rootCheck, setRootCheck] = useState<RootCheck>(null);
  const [hasLast, setHasLast] = useState(false);
  const [binding, setBinding] = useState<Binding | null>(null);

  useEffect(() => {
    const raw = readLastBundle();
    if (!raw) return;
    // Client-only value read after mount so the server and first client render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasLast(true);
    setText(raw);
    try {
      setBundle(parseBundle(raw));
    } catch {
      setBundle(null);
    }
  }, []);

  const review = async () => {
    setError(null);
    setRootCheck(null);
    setBinding(null);
    try {
      const b = parseBundle(text);
      setBundle(b);
      setBinding(await bindingOf(b));
      if (b.book && bookLive() && b.book.address.toLowerCase() === CONTRACTS.book.toLowerCase()) {
        const d = await loadGroup(Number(b.book.groupId));
        if (d) {
          const computed = rootOf(d.leaves);
          setRootCheck({ state: rootMatchesList(d.roots.at(-1), computed, d.group.digest), leaves: d.leaves.length, computed: computed.toString(16).slice(0, 16) });
        }
      }
    } catch (e) {
      setBundle(null);
      setError(e instanceof Error ? e.message : "That bundle could not be read.");
    }
  };

  const signalOk = bundle ? signalOf(bundle.message) === BigInt(bundle.signal) : null;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.22fr]">
        <div className="card flex min-w-0 flex-col gap-5 p-6 md:p-7">
          <span className="pill self-start">
            <span className={`dot ${bundle ? "dot-live" : "dot-off"}`} />
            {bundle ? "bundle loaded" : "no bundle yet"}
          </span>
          <div>
            <label className="mono-label mb-2 block" htmlFor="review-input">
              Proof bundle
            </label>
            <textarea id="review-input" className="field mono !text-[13px]" rows={8} spellCheck={false} placeholder={'{"kind":"zekro-proof-1", …}'} value={text} onChange={(e) => setText(e.target.value)} data-testid="review-input" />
            <p className="field-note">{hasLast ? "The last proof made in this browser is filled in." : "Make one on the Prove page, or paste one a member gave you."} A bundle with a secret in it is refused.</p>
          </div>
          <button type="button" className="btn btn-light w-full justify-center" onClick={review} data-testid="review-run">
            <span>Review it</span>
            <ArrowRight size={15} />
          </button>
          {error ? <p className="alert" role="alert">{error}</p> : null}
          <p className="text-[13px] leading-[1.5] text-muted">Reviewing reads the bundle and, for a group in the book, the group&apos;s public list. It does not check the proof itself; the Verify page does that.</p>
        </div>
        <div className="card flex min-w-0 flex-col gap-4 p-6 md:p-7">
          <p className="mono-label">What the proof reveals</p>
          <div className="overflow-x-auto">
            <table className="tbl min-w-[560px]" data-testid="review-table">
              <thead>
                <tr>
                  <th>Value</th>
                  <th>It tells a verifier</th>
                  <th>It does not tell</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.key}>
                    <td className="whitespace-nowrap">
                      {r.name}
                      <span className="mono mt-1 block text-[12px] text-muted">{bundle ? `${bundle[r.key].slice(0, 10)}…${bundle[r.key].slice(-6)}` : "—"}</span>
                    </td>
                    <td>{r.tells}</td>
                    <td className="text-muted">{r.doesNot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bundle ? (
            <p className="text-[13px] text-muted" data-testid="review-message">
              Message: <span className="wrapline text-ink2">{bundle.message || "—"}</span> {signalOk ? "(matches the signal)" : "(does NOT match the signal: treat it as unverified text)"}
            </p>
          ) : null}
          {binding ? (
            <p className={`${binding.tone === "ok" ? "ok-note" : "limit"} wrapline`} data-testid="review-binding">
              {binding.text}
            </p>
          ) : null}
          {rootCheck ? (
            <p className={rootCheck.state === "match" ? "ok-note" : "limit"} data-testid="review-root">
              {rootCheck.state === "match"
                ? `Rebuilt the tree from the book's ${rootCheck.leaves} leaves: it matches the group's latest root.`
                : rootCheck.state === "mismatch"
                  ? `Rebuilt the tree from the book's ${rootCheck.leaves} leaves: it does NOT match the root the curator published. Treat this group with care.`
                  : rootCheck.state === "older-list"
                    ? "The list has changed since the latest root was published, so they cannot be compared yet."
                    : "This group has not published a root."}
            </p>
          ) : null}
          <div className="well min-w-0">
            <p className="mono-label mb-2">Check the verifier yourself</p>
            <pre className="mono overflow-x-auto text-[12px] leading-relaxed text-ink2">{`nargo --version    # 1.0.0-beta.22
bb --version       # 5.0.0-nightly.20260522
bash circuits/build.sh --check`}</pre>
            <p className="mt-2 text-[12px] text-muted">Recompiles the circuit from source, regenerates the verifier and compares both with what this site serves{bookLive() ? ` and what runs on chain ${CHAIN.id}` : ""}.</p>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="card p-6 md:p-7">
          <p className="mono-label mb-4">Kept out of the proof</p>
          <ul className="flex flex-col gap-2.5 text-[15px] text-ink2">
            {NEVER.map((n) => (
              <li key={n} className="flex gap-3">
                <span className="dot dot-live mt-2" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6 md:p-7" data-testid="review-limit">
          <p className="mono-label mb-4">Can stay visible anyway</p>
          <ul className="flex flex-col gap-2.5 text-[15px] text-ink2">
            {STILL.map((n) => (
              <li key={n} className="flex gap-3">
                <span className="dot mt-2 !bg-warn" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-8 max-w-[70ch] text-[13px] leading-[1.5] text-muted">A zero-knowledge proof proves only the statement designed into the circuit. If this list surprises you, read it again before you rely on a proof: no word on this site means anonymous, and nothing here can make your other activity disappear.</p>
    </>
  );
}
