/*
 * Browser prover, run as a dedicated web worker (bundled by scripts/build-prover.mjs into public/zk/prover.js).
 * It solves the witness with noir_js and proves with Barretenberg (UltraHonk, EVM target) in WASM. Every file
 * it needs is served by this site: the circuit, the WASM binaries and the public SRS points (first 2^17 points of
 * the public Ignition ceremony). The identity stays in this worker; only the proof and public values leave it.
 */
import { Noir } from "@noir-lang/noir_js";
import initACVM from "@noir-lang/acvm_js";
import initNoirC from "@noir-lang/noirc_abi";
import { Barretenberg, BackendType, UltraHonkBackend } from "@aztec/bb.js";
import { membershipWitness, publicInputsOf, type PublicValues } from "./core.ts";

type Request =
  | { id: number; kind: "warm" }
  | { id: number; kind: "prove"; secret: bigint; salt: bigint; leaves: bigint[]; scope: bigint; signal: bigint }
  | { id: number; kind: "verify"; proof: string; values: PublicValues };

const BASE = new URL("./", self.location.href).href;
const SRS_POINTS = 131_072; // bb accepts compressed points in 4 MiB blocks (2^17 points); the circuit needs 2^15.

let ready: Promise<{ noir: Noir; backend: UltraHonkBackend }> | null = null;

async function bytes(path: string) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function init() {
  ready ??= (async () => {
    await Promise.all([initACVM({ module_or_path: fetch(BASE + "acvm_js_bg.wasm") }), initNoirC({ module_or_path: fetch(BASE + "noirc_abi_wasm_bg.wasm") })]);
    const circuit = await (await fetch(BASE + "membership.json")).json();
    const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, wasmPath: BASE + "barretenberg.wasm.gz", skipSrsInit: true });
    const [g1, g2] = await Promise.all([bytes("crs/bn254_g1_compressed.dat"), bytes("crs/bn254_g2.dat")]);
    await api.srsInitSrs({ pointsBuf: g1, numPoints: SRS_POINTS, g2Point: g2 });
    return { noir: new Noir(circuit), backend: new UltraHonkBackend(circuit.bytecode, api) };
  })();
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const msg = event.data;
  try {
    const { noir, backend } = await init();
    if (msg.kind === "warm") {
      self.postMessage({ id: msg.id, ok: true });
      return;
    }
    if (msg.kind === "verify") {
      const started = performance.now();
      const proof = Uint8Array.from((msg.proof.replace(/^0x/, "").match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));
      let valid = false;
      try {
        valid = await backend.verifyProof({ proof, publicInputs: publicInputsOf(msg.values) }, { verifierTarget: "evm" });
      } catch {
        valid = false;
      }
      self.postMessage({ id: msg.id, ok: true, valid, ms: Math.round(performance.now() - started) });
      return;
    }
    const started = performance.now();
    const { witness, values, index } = membershipWitness({ secret: msg.secret, salt: msg.salt }, msg.leaves, msg.scope, msg.signal);
    const { witness: solved } = await noir.execute(witness);
    const { proof } = await backend.generateProof(solved, { verifierTarget: "evm" });
    const hex = Array.from(proof, (b) => b.toString(16).padStart(2, "0")).join("");
    self.postMessage({ id: msg.id, ok: true, proof: `0x${hex}`, values, index, ms: Math.round(performance.now() - started) });
  } catch (error) {
    self.postMessage({ id: msg.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
