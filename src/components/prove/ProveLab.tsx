"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "@/components/site/Icons";
import { saveLastBundle } from "@/lib/studio-store";
import { proveMembership, verifyMembership } from "@/lib/zk/prover-client";
import { commitmentOf, makeBundle, newIdentity, nullifierOf, practiceScope, rootOf, signalOf, tamperWord, toHex32, TREE_DEPTH, type ProofBundle } from "@/lib/zk/core";

/* The whole thing, with nothing sent: twenty strangers and you in a tree in memory, a real proof, a real check, a tampered check. */

const short = (hex: string) => `${hex.slice(0, 12)}…${hex.slice(-8)}`;
const BYSTANDERS = 20;
const MESSAGE = "I belong to this group.";
const STEPS = [`A list of twenty strangers plus you becomes a ${TREE_DEPTH}-level Merkle tree on your device.`, "A background worker shows you hold the private values for some leaf and locks the result to a message. Which leaf stays unsaid.", "The verification key tests the result. After that, one public value gets altered and tested once more, and that second test has to fail."];

type Result = {
  bundle: ProofBundle;
  secret: string;
  salt: string;
  leafIndex: number;
  ms: number;
  verifyMs: number;
  valid: boolean;
  tampered: { name: string; valid: boolean }[];
};

export function ProveLab() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setBusy("Loading the circuit and the prover (about 4 MB, once)…");
    setError(null);
    setResult(null);
    try {
      const me = newIdentity();
      const leaves = Array.from({ length: BYSTANDERS }, () => commitmentOf(newIdentity()));
      const at = Math.floor(Math.random() * (BYSTANDERS + 1));
      leaves.splice(at, 0, commitmentOf(me));
      const scope = practiceScope("the proving lab");
      const signal = signalOf(MESSAGE);
      setBusy("Proving in this tab…");
      const { proof, values, ms } = await proveMembership(me, leaves, scope, signal);
      if (values.root !== rootOf(leaves) || values.nullifier !== nullifierOf(me.secret, scope)) throw new Error("The prover answered with other public values.");
      setBusy("Checking the proof…");
      const check = await verifyMembership(proof, values);
      const bundle = makeBundle(proof, values, MESSAGE, { ms });
      setBusy("Changing one value and checking again…");
      const tampered = [
        { name: "Root", valid: (await verifyMembership(proof, { ...values, root: BigInt(tamperWord(toHex32(values.root))) })).valid },
        { name: "Nullifier", valid: (await verifyMembership(proof, { ...values, nullifier: BigInt(tamperWord(toHex32(values.nullifier))) })).valid },
        { name: "Message", valid: (await verifyMembership(proof, { ...values, signal: signalOf("I belong to another group.") })).valid },
      ];
      saveLastBundle(bundle);
      setResult({ bundle, secret: toHex32(me.secret), salt: toHex32(me.salt), leafIndex: at, ms, verifyMs: check.ms, valid: check.valid, tampered });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The prover failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.22fr]">
      <div className="card flex min-w-0 flex-col gap-5 p-6 md:p-7">
        <p className="mono-label">The setup</p>
        <ol className="flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <li key={s} className="grid grid-cols-[28px_1fr] gap-2 text-[15px] leading-[1.5] text-ink2">
              <span className="mono pt-0.5 text-[13px] text-lift">{String(i + 1).padStart(2, "0")}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="text-[13px] leading-[1.5] text-muted">This is the circuit and key the studio runs on. Your values stay on your device; only the prover files come down from this site, one time.</p>
        <button type="button" className="btn btn-light w-full justify-center" onClick={run} disabled={Boolean(busy)} data-testid="prove-run">
          {busy ? <span className="spin" /> : null}
          <span>{busy ? "Working" : result ? "Make another proof" : "Run the proof"}</span>
          {busy ? null : <ArrowRight size={15} />}
        </button>
        {busy ? <p className="text-[13px] text-muted" data-testid="prove-busy">{busy}</p> : null}
        {error ? <p className="alert" role="alert">{error}</p> : null}
      </div>
      <div className="card flex min-h-[420px] min-w-0 flex-col gap-4 p-6 md:p-7">
        <p className="mono-label">You versus a verifier</p>
        {!result ? (
          <p className="body text-muted">Press the button to fill this side in: your private values next to the public ones, and how each test went. Your device may pause for several seconds.</p>
        ) : (
          <div className="flex flex-col gap-5" data-testid="prove-result">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="well min-w-0">
                <p className="mono-label mb-3">You knew</p>
                <dl className="mono flex flex-col gap-2 text-[12px] text-ink2">
                  <div><dt className="text-muted">secret</dt><dd className="truncate">{short(result.secret)}</dd></div>
                  <div><dt className="text-muted">salt</dt><dd className="truncate">{short(result.salt)}</dd></div>
                  <div><dt className="text-muted">your leaf</dt><dd>number {result.leafIndex} of {BYSTANDERS + 1}</dd></div>
                </dl>
              </div>
              <div className="well min-w-0">
                <p className="mono-label mb-3">A verifier saw</p>
                <dl className="mono flex flex-col gap-2 text-[12px] text-ink2">
                  <div><dt className="text-muted">root</dt><dd className="truncate">{short(result.bundle.root)}</dd></div>
                  <div><dt className="text-muted">nullifier</dt><dd className="truncate">{short(result.bundle.nullifier)}</dd></div>
                  <div><dt className="text-muted">message</dt><dd className="truncate font-sans">{result.bundle.message}</dd></div>
                </dl>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Proof as made, against this pretend group</td>
                  <td className={result.valid ? "text-good" : "text-bad"} data-testid="prove-valid">{result.valid ? "valid" : "not valid"}</td>
                </tr>
                {result.tampered.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name} changed</td>
                    <td className={t.valid ? "text-bad" : "text-good"} data-testid={`prove-tampered-${t.name.toLowerCase()}`}>{t.valid ? "valid: this should never happen" : "refused, as it must be"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[13px] text-muted" data-testid="prove-times">
              Measured on this device, in this tab: proof {(result.ms / 1000).toFixed(1)} s, check {(result.verifyMs / 1000).toFixed(1)} s, proof size {(result.bundle.proof.length - 2) / 2} bytes. Your numbers will differ.
            </p>
            <p className="limit">
              <strong>What this shows:</strong> the maths works, against a tree made up in this tab. It is not membership of any real group; the Verify page will say so too. <strong>Not hidden by a proof:</strong> your IP, your network metadata and, on chain, the wallet that sends it can stay visible.
            </p>
            <Link href="/review" className="btn btn-ghost btn-sm self-start">
              <span>Review this proof</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
