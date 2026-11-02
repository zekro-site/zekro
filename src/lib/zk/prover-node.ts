/*
 * Node prover for the tests and the contract tests (forge ffi). Uses the same circuit artifact as the browser.
 */
import { readFileSync } from "node:fs";
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { membershipWitness, publicInputsOf, toHex32, type Identity, type PublicValues } from "./core.ts";

const CIRCUIT = JSON.parse(readFileSync(new URL("../../../public/zk/membership.json", import.meta.url), "utf8"));

let ready: Promise<{ noir: Noir; backend: UltraHonkBackend; api: Barretenberg }> | null = null;

function init(threads = 2) {
  ready ??= (async () => {
    const api = await Barretenberg.new({ threads });
    return { noir: new Noir(CIRCUIT), backend: new UltraHonkBackend(CIRCUIT.bytecode, api), api };
  })();
  return ready;
}

export async function proveNode(id: Identity, leaves: bigint[], scope: bigint, signal: bigint) {
  const { witness, values, index } = membershipWitness(id, leaves, scope, signal);
  const { noir, backend } = await init();
  const started = Date.now();
  const { witness: solved } = await noir.execute(witness);
  const { proof, publicInputs } = await backend.generateProof(solved, { verifierTarget: "evm" });
  const hex = Array.from(proof, (b) => b.toString(16).padStart(2, "0")).join("");
  return { proof: `0x${hex}` as `0x${string}`, publicInputs, values, index, ms: Date.now() - started };
}

export async function verifyNode(proof: string, values: PublicValues) {
  const { backend } = await init();
  const bytes = Uint8Array.from(Buffer.from(proof.replace(/^0x/, ""), "hex"));
  return backend.verifyProof({ proof: bytes, publicInputs: publicInputsOf(values) }, { verifierTarget: "evm" });
}

export async function closeProver() {
  if (!ready) return;
  const { api } = await ready;
  await api.destroy();
  ready = null;
}

export { toHex32 };
