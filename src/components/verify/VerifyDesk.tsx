"use client";

import { useState } from "react";
import { decodeFunctionData, type Abi } from "viem";
import { ArrowRight } from "@/components/site/Icons";
import { CHAIN, isAddress } from "@/config/brand";
import { CONTRACTS, bookLive } from "@/config/contracts";
import { BOOK_ABI, REFUSAL_WORDS } from "@/lib/abi";
import { checkOnChain, isNullifierUsed, precheck, rootCountOf, rootEntry, scopeEntry } from "@/lib/book-chain";
import { explain, rpcCall } from "@/lib/client";
import { judgeBundle, judgeTx, rootAgedOut, type BundleFacts, type Judged } from "@/lib/verdict";
import { verifyMembership } from "@/lib/zk/prover-client";
import { bundleValues, parseBundle, scopeFieldOf, signalOf, toHex32, type PublicValues } from "@/lib/zk/core";

/*
 * Anyone can check a proof here. A pasted bundle or a transaction hash is rebuilt into the public values, then checked with
 * the verification key in this tab. Nothing about the check depends on this site's server: the relay only reads the chain.
 */

type Line = { label: string; value: string; tone?: "good" | "bad" | "plain" };
type Outcome = Judged & { lines: Line[]; values: PublicValues; message?: string; unverifiedText?: string };

const yesNo = (ok: boolean): Pick<Line, "value" | "tone"> => ({ value: ok ? "yes" : "no", tone: ok ? "good" : "bad" });
const chainLine = (v: boolean | null): Line => ({ label: "Verifier contract (read)", value: v === null ? "could not be read" : v ? "valid" : "not valid", tone: v === null ? "plain" : v ? "good" : "bad" });

async function fromBundle(text: string): Promise<Outcome> {
  const b = parseBundle(text);
  const values = bundleValues(b);
  const lines: Line[] = [];
  const check = await verifyMembership(b.proof, values);
  lines.push({ label: "Proof against its public values", value: check.valid ? "valid" : "not valid", tone: check.valid ? "good" : "bad" });
  const signalMatches = signalOf(b.message) === values.signal;
  lines.push({ label: "Message matches the signal", ...yesNo(signalMatches) });

  let bound: BundleFacts["bound"] = null;
  let otherContract = false;
  let chainValid: boolean | null = null;
  const named = b.book && isAddress(b.book.address) ? b.book.address.toLowerCase() : null;
  if (!b.book || b.book.address === "practice") {
    lines.push({ label: "Group", value: b.book ? "made in practice mode, in someone's browser" : "this bundle names no group", tone: "plain" });
  } else if (!bookLive()) {
    lines.push({ label: "Group", value: "this site has no deployed book to compare with", tone: "plain" });
  } else if (named !== CONTRACTS.book.toLowerCase()) {
    otherContract = true;
    lines.push({ label: "Group book", value: `made for another contract: ${b.book.address}`, tone: "bad" });
  } else {
    const g = Number(b.book.groupId);
    const s = Number(b.book.scopeId);
    const q = Number(b.book.rootSeq);
    const [root, scope, used, rootCount] = await Promise.all([rootEntry(g, q), scopeEntry(g, s), isNullifierUsed(g, s, values.nullifier), rootCountOf(g)]);
    bound = { rootMatches: root.root !== 0n && root.root === values.root, scopeMatches: scope.field === values.scope, revoked: root.revoked, tooOld: rootAgedOut(q, rootCount) };
    lines.push({ label: `Root ${q} of group ${g}`, value: !bound.rootMatches ? "differs from the book" : root.revoked ? "matches, but it was revoked" : bound.tooOld ? "matches, but it has aged out" : "matches the book", tone: !bound.rootMatches || root.revoked || bound.tooOld ? "bad" : "good" });
    lines.push({ label: `Scope ${s} of group ${g}`, value: bound.scopeMatches ? "matches the book" : "differs from the book", tone: bound.scopeMatches ? "good" : "bad" });
    lines.push({ label: "Nullifier", value: used ? "recorded in this scope" : "not recorded yet", tone: "plain" });
    const word = await precheck(g, s, q, values.nullifier, values.signal, b.proof).catch(() => null);
    if (word) lines.push({ label: "The contract's answer if sent now", value: REFUSAL_WORDS[word], tone: word === "None" ? "good" : "plain" });
    chainValid = await checkOnChain(b.proof, values);
    lines.push(chainLine(chainValid));
  }
  const judged = judgeBundle({ proofValid: check.valid, signalMatches, chainValid, bound, otherContract });
  return { ...judged, lines, values, ...(signalMatches ? { message: b.message } : { unverifiedText: b.message }) };
}

async function fromTx(hash: string): Promise<Outcome> {
  if (!bookLive()) throw new Error(`The group book is not deployed yet, so there are no proof transactions to read. Paste a proof bundle instead.`);
  const tx = await rpcCall<{ to: string | null; from: string; input: `0x${string}` } | null>("eth_getTransactionByHash", [hash]);
  if (!tx) throw new Error("That transaction was not found on this chain.");
  if (!tx.to || tx.to.toLowerCase() !== CONTRACTS.book.toLowerCase()) throw new Error("That transaction was not sent to the group book.");
  const decoded = decodeFunctionData({ abi: BOOK_ABI as Abi, data: tx.input }) as { functionName: string; args: readonly unknown[] };
  if (decoded.functionName !== "submitProof") throw new Error(`That transaction called ${decoded.functionName}, not submitProof.`);
  const [g, s, q, nullifier, signal, proof, note] = decoded.args as [bigint, bigint, bigint, bigint, bigint, `0x${string}`, string];
  const receipt = await rpcCall<{ status: string } | null>("eth_getTransactionReceipt", [hash]);
  const [root, scope, rootCount] = await Promise.all([rootEntry(Number(g), Number(q)), scopeEntry(Number(g), Number(s)), rootCountOf(Number(g))]);
  // Rebuilt the way the contract rebuilds them, without trusting anything else in the transaction.
  const expectedScope = scopeFieldOf(CHAIN.id, CONTRACTS.book as `0x${string}`, g, s);
  const values: PublicValues = { root: root.root, scope: scope.field, nullifier, signal };
  const check = await verifyMembership(proof, values);
  const chainValid = await checkOnChain(proof, values);
  const tooOld = rootAgedOut(Number(q), rootCount);
  const scopeMatches = expectedScope === scope.field;
  const noteMatches = note ? signalOf(note) === signal : null;
  const lines: Line[] = [
    { label: "Sent by (public, not hidden by the proof)", value: tx.from, tone: "plain" },
    { label: "Transaction", value: receipt?.status === "0x1" ? "succeeded" : receipt ? "reverted" : "not mined yet", tone: receipt?.status === "0x1" ? "good" : "bad" },
    { label: `Group ${g}, scope ${s}, root ${q}`, value: root.revoked ? "valid when sent, since revoked" : tooOld ? "valid when sent, since aged out" : "root stands in the book", tone: root.revoked || tooOld ? "bad" : "good" },
    { label: "Scope value matches the contract's formula", ...yesNo(scopeMatches) },
    { label: "Proof checked in this tab with the published key", value: check.valid ? "valid" : "not valid", tone: check.valid ? "good" : "bad" },
    chainLine(chainValid),
  ];
  if (noteMatches !== null) lines.push({ label: "Text sent with it matches the signal", ...yesNo(noteMatches) });
  const judged = judgeTx({ proofValid: check.valid, receiptStatus: receipt ? receipt.status : null, scopeMatches, chainValid, revoked: root.revoked, tooOld, noteMatches });
  return { ...judged, lines, values, ...(noteMatches === true ? { message: note } : noteMatches === false ? { unverifiedText: note } : {}) };
}

export function VerifyDesk() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const text = input.trim();
      if (!text) throw new Error("Paste a transaction hash or a proof bundle.");
      const r = /^0x[0-9a-fA-F]{64}$/.test(text) ? await fromTx(text) : await fromBundle(text);
      setOut(r);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.22fr]">
      <div className="card flex min-w-0 flex-col gap-5 p-6 md:p-7">
        <div>
          <label className="mono-label mb-2 block" htmlFor="verify-input">
            Transaction hash or proof bundle
          </label>
          <textarea id="verify-input" className="field mono !text-[13px]" rows={7} spellCheck={false} placeholder={'0x… or {"kind":"zekro-proof-1", …}'} value={input} onChange={(e) => setInput(e.target.value)} data-testid="verify-input" />
          <p className="field-note">A submitProof transaction on chain {CHAIN.id}, or the bundle a member gave you. A bundle carries no secret.</p>
        </div>
        <button type="button" className="btn btn-light w-full justify-center" onClick={run} disabled={busy} data-testid="verify-run">
          {busy ? <span className="spin" /> : null}
          <span>{busy ? "Checking" : "Check it"}</span>
          {busy ? null : <ArrowRight size={15} />}
        </button>
        {error ? <p className="alert" role="alert" data-testid="verify-error">{error}</p> : null}
        <p className="text-[13px] leading-[1.5] text-muted">Public values get rebuilt here and tested on your device with the site&apos;s public verification key. The verdict is computed here, from book state read through this site&apos;s relay or a public RPC, so a group check is only as good as that read. Only a proof tied to a root still standing in the book is called valid membership.</p>
      </div>
      <div className="card flex min-h-[420px] min-w-0 flex-col gap-4 p-6 md:p-7">
        <p className="mono-label">What the check found</p>
        {!out ? (
          <p className="body text-muted">The verdict appears here, with each value it was checked against.</p>
        ) : (
          <div className="flex flex-col gap-4" data-testid="verify-result">
            <p className={`h3 ${out.verdict === "current" ? "text-good" : out.verdict === "invalid" ? "text-bad" : "text-warn"}`} data-testid="verify-verdict" data-verdict={out.verdict}>{out.title}</p>
            {out.reasons.length ? (
              <ul className={out.verdict === "invalid" ? "alert flex flex-col gap-1" : "limit flex flex-col gap-1"} data-testid="verify-reasons">
                {out.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            <table className="tbl">
              <tbody>
                {out.lines.map((l) => (
                  <tr key={l.label}>
                    <td className="!text-ink2">{l.label}</td>
                    <td className={`wrapline ${l.tone === "good" ? "text-good" : l.tone === "bad" ? "text-bad" : ""}`}>{l.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="well mono flex flex-col gap-2 text-[12px] text-ink2">
              {(["root", "scope", "nullifier", "signal"] as const).map((k) => (
                <div key={k} className="min-w-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="wrapline">{toHex32(out.values[k])}</dd>
                </div>
              ))}
              {out.message ? (
                <div>
                  <dt className="text-muted">message, matches the signal</dt>
                  <dd className="wrapline font-sans">{out.message}</dd>
                </div>
              ) : null}
              {out.unverifiedText ? (
                <div data-testid="verify-unverified">
                  <dt className="text-bad">unverified text, does NOT match the signal</dt>
                  <dd className="wrapline font-sans text-bad">{out.unverifiedText}</dd>
                </div>
              ) : null}
            </dl>
            <p className="limit">
              <strong>What this does not tell you:</strong> a valid proof says someone in that root&apos;s list made it. It does not say who, it means little unless you trust that root, and it does not hide the wallet, IP or transaction activity around it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
