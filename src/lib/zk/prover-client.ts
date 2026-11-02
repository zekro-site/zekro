"use client";

import type { Identity, PublicValues } from "./core";

/* Talks to the prover worker (public/zk/prover.js). One worker per tab, started on first use. */

type Reply = { id: number; ok: boolean; error?: string; proof?: `0x${string}`; values?: PublicValues; index?: number; ms?: number; valid?: boolean };

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { ok: (r: Reply) => void; no: (e: Error) => void }>();

function start(): Worker {
  if (worker) return worker;
  worker = new Worker("/zk/prover.js", { type: "module" });
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.ok) w.ok(e.data);
    else w.no(new Error(e.data.error ?? "The prover failed."));
  };
  worker.onerror = (e) => {
    for (const w of waiting.values()) w.no(new Error(e.message || "The prover could not start."));
    waiting.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function ask(message: Record<string, unknown>): Promise<Reply> {
  const id = ++seq;
  return new Promise((ok, no) => {
    waiting.set(id, { ok, no });
    start().postMessage({ id, ...message });
  });
}

export const warmProver = () => ask({ kind: "warm" });

export async function proveMembership(id: Identity, leaves: bigint[], scope: bigint, signal: bigint) {
  const r = await ask({ kind: "prove", secret: id.secret, salt: id.salt, leaves, scope, signal });
  return { proof: r.proof as `0x${string}`, values: r.values as PublicValues, index: r.index as number, ms: r.ms as number };
}

export async function verifyMembership(proof: string, values: PublicValues) {
  const r = await ask({ kind: "verify", proof, values });
  return { valid: Boolean(r.valid), ms: r.ms as number };
}
