/*
 * ZEKRO membership cryptography, shared by the browser, the prover worker, the Node tests and the contract
 * tests. No framework imports: this file runs as-is under tsx and in the bundled worker.
 *
 * Hashes are circomlib-compatible Poseidon over BN254 (poseidon-lite), the same instance as
 * circuits/membership; the tests of both pin one shared vector.
 *
 *   commitment = Poseidon2(secret, salt)
 *   nullifier  = Poseidon2(secret, scope)
 *   signal     = uint(keccak256(utf8(message))) >> 8
 *   scope      = uint(keccak256(abi.encode(chainId, book, groupId, scopeId))) >> 8   (ZekroGroupBook.scopeField)
 */
import { poseidon2 } from "poseidon-lite/poseidon2";
import { encodeAbiParameters, keccak256, stringToHex } from "viem";

export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const TREE_DEPTH = 16;
export const MAX_LEAVES = 2 ** TREE_DEPTH;
export const ROOT_HISTORY = 32;

/* ------------------------------------------------------------------ fields */

export const toHex32 = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
export const isField = (n: bigint) => n >= 0n && n < FIELD;

/** Parses a decimal or 0x-hex string (or bigint) into a field element; throws when out of range. */
export function toField(v: bigint | number | string): bigint {
  let n: bigint;
  try {
    n = typeof v === "bigint" ? v : BigInt(v);
  } catch {
    throw new Error("Not a number");
  }
  if (!isField(n)) throw new Error("Not a field element");
  return n;
}

/** A uniformly random nonzero field element (31 random bytes are always below the field order). */
export function randomField(): bigint {
  const b = new Uint8Array(31);
  for (;;) {
    globalThis.crypto.getRandomValues(b);
    const n = BigInt(`0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`);
    if (n !== 0n) return n;
  }
}

export const hash2 = (a: bigint, b: bigint) => poseidon2([a, b]);

/* ------------------------------------------------------------------ identity, values */

/** The two private values of a member. They never leave the browser. */
export type Identity = { secret: bigint; salt: bigint };

export const newIdentity = (): Identity => ({ secret: randomField(), salt: randomField() });
export const commitmentOf = (id: Identity) => hash2(id.secret, id.salt);
export const nullifierOf = (secret: bigint, scope: bigint) => hash2(secret, scope);

/** The value a proof is tied to: keccak of the message, shifted into 248 bits. */
export const signalOf = (message: string) => BigInt(keccak256(stringToHex(message))) >> 8n;

/** Scope for a practice run, not tied to any contract. */
export const practiceScope = (label: string) => BigInt(keccak256(stringToHex(`practice:${label}`))) >> 8n;

/** Mirrors ZekroGroupBook.scopeField. */
export function scopeFieldOf(chainId: number, book: `0x${string}`, groupId: bigint, scopeId: bigint): bigint {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
    [BigInt(chainId), book, groupId, scopeId],
  );
  return BigInt(keccak256(encoded)) >> 8n;
}

/** Text form for the backup a member keeps: "zekro-id-1:<secret>:<salt>". */
export const encodeIdentity = (id: Identity) => `zekro-id-1:${toHex32(id.secret)}:${toHex32(id.salt)}`;

export function decodeIdentity(text: string): Identity {
  const m = /^zekro-id-1:(0x[0-9a-f]{64}):(0x[0-9a-f]{64})$/.exec(text.trim());
  if (!m) throw new Error("That is not a Zekro identity backup.");
  const secret = toField(m[1]);
  const salt = toField(m[2]);
  if (secret === 0n) throw new Error("That identity has a zero secret.");
  return { secret, salt };
}

/* ------------------------------------------------------------------ tree */

let zeroCache: bigint[] | null = null;
/** Empty-subtree value per level: level 0 is 0n. */
export function zeros(): bigint[] {
  if (!zeroCache) {
    zeroCache = [0n];
    for (let i = 0; i < TREE_DEPTH; i++) zeroCache.push(hash2(zeroCache[i], zeroCache[i]));
  }
  return zeroCache;
}

/** Levels of the sparse tree over `leaves`. A cleared leaf is 0n, exactly like an empty one. */
function levelsOf(leaves: readonly bigint[]): bigint[][] {
  if (leaves.length > MAX_LEAVES) throw new Error("Too many leaves for this tree.");
  const z = zeros();
  const levels: bigint[][] = [[...leaves]];
  for (let d = 0; d < TREE_DEPTH; d++) {
    const cur = levels[d];
    const next: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(hash2(cur[i], i + 1 < cur.length ? cur[i + 1] : z[d]));
    levels.push(next);
  }
  return levels;
}

export function rootOf(leaves: readonly bigint[]): bigint {
  if (leaves.length === 0) return zeros()[TREE_DEPTH];
  return levelsOf(leaves)[TREE_DEPTH][0];
}

export type MerklePath = { elements: bigint[]; indices: number[] };

export function pathOf(leaves: readonly bigint[], index: number): MerklePath {
  if (index < 0 || index >= leaves.length || leaves[index] === 0n) throw new Error("That leaf is not in the list.");
  const z = zeros();
  const levels = levelsOf(leaves);
  const elements: bigint[] = [];
  const indices: number[] = [];
  let at = index;
  for (let d = 0; d < TREE_DEPTH; d++) {
    const sibling = at ^ 1;
    elements.push(sibling < levels[d].length ? levels[d][sibling] : z[d]);
    indices.push(at & 1);
    at >>= 1;
  }
  return { elements, indices };
}

/* ------------------------------------------------------------------ list digest (ZekroGroupBook.leavesDigest) */

export type ListOp = { kind: "add" | "clear"; index: number; commitment: bigint };

export const ZERO_DIGEST = `0x${"0".repeat(64)}` as `0x${string}`;

export function nextDigest(digest: `0x${string}`, op: ListOp): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint8" }, { type: "uint32" }, { type: "uint256" }],
      [digest, op.kind === "add" ? 1 : 2, op.index, op.commitment],
    ),
  );
}

/** Replays the list events into the leaves and the digest the contract must hold. */
export function replayList(ops: readonly ListOp[]): { leaves: bigint[]; digest: `0x${string}` } {
  const leaves: bigint[] = [];
  let digest = ZERO_DIGEST;
  for (const op of ops) {
    digest = nextDigest(digest, op);
    if (op.kind === "add") leaves[op.index] = op.commitment;
    else leaves[op.index] = 0n;
  }
  return { leaves, digest };
}

/* ------------------------------------------------------------------ witness + proof bundle */

export type PublicValues = { root: bigint; scope: bigint; nullifier: bigint; signal: bigint };

export type Witness = Record<string, string | string[]>;

/** Builds the circuit input; throws in plain words if this identity is not in the list. */
export function membershipWitness(id: Identity, leaves: readonly bigint[], scope: bigint, signal: bigint): { witness: Witness; values: PublicValues; index: number } {
  const commitment = commitmentOf(id);
  const index = leaves.indexOf(commitment);
  if (index < 0) throw new Error("This identity's commitment is not in that list.");
  if (scope >> 248n !== 0n || signal >> 248n !== 0n) throw new Error("Scope and signal must fit in 248 bits.");
  const { elements, indices } = pathOf(leaves, index);
  const root = rootOf(leaves);
  const nullifier = nullifierOf(id.secret, scope);
  return {
    index,
    values: { root, scope, nullifier, signal },
    witness: {
      root: toHex32(root),
      scope: toHex32(scope),
      nullifier: toHex32(nullifier),
      signal: toHex32(signal),
      secret: toHex32(id.secret),
      salt: toHex32(id.salt),
      path_elements: elements.map(toHex32),
      path_indices: indices.map((b) => (b ? "0x1" : "0x0")),
    },
  };
}

/** Order of the circuit's public inputs (main's `pub` parameters). */
export const publicInputsOf = (v: PublicValues): string[] => [toHex32(v.root), toHex32(v.scope), toHex32(v.nullifier), toHex32(v.signal)];

/** What a member can hand to anyone: everything a verifier needs and nothing private. */
export type ProofBundle = {
  kind: "zekro-proof-1";
  proof: `0x${string}`;
  root: string;
  scope: string;
  nullifier: string;
  signal: string;
  message: string;
  /** Present when the proof was made for a group in the book. */
  book?: { address: string; groupId: string; scopeId: string; rootSeq: string };
  /** Time this browser took, in milliseconds. Only meaningful on the device that made it. */
  ms?: number;
};

export function makeBundle(proof: `0x${string}`, v: PublicValues, message: string, extra?: Pick<ProofBundle, "book" | "ms">): ProofBundle {
  return { kind: "zekro-proof-1", proof, root: toHex32(v.root), scope: toHex32(v.scope), nullifier: toHex32(v.nullifier), signal: toHex32(v.signal), message, ...extra };
}

/** Strict parse of pasted bundle JSON. Any secret-looking extra field is refused so it is not shared by accident. */
export function parseBundle(text: string): ProofBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That is not JSON.");
  }
  if (!raw || typeof raw !== "object") throw new Error("That is not a proof bundle.");
  const o = raw as Record<string, unknown>;
  if (o.kind !== "zekro-proof-1") throw new Error("That is not a Zekro proof bundle.");
  if ("secret" in o || "salt" in o) throw new Error("This bundle carries a secret. Do not share it.");
  if (typeof o.proof !== "string" || !/^0x([0-9a-fA-F]{2})+$/.test(o.proof)) throw new Error("The proof must be hex bytes.");
  for (const k of ["root", "scope", "nullifier", "signal"]) {
    if (typeof o[k] !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(o[k] as string)) throw new Error(`${k} must be a 32-byte hex word.`);
    if (!isField(BigInt(o[k] as string))) throw new Error(`${k} is outside the field.`);
  }
  if (typeof o.message !== "string") throw new Error("The message is missing.");
  return o as unknown as ProofBundle;
}

export const bundleValues = (b: ProofBundle): PublicValues => ({ root: BigInt(b.root), scope: BigInt(b.scope), nullifier: BigInt(b.nullifier), signal: BigInt(b.signal) });

/** Flips one byte of a 32-byte word's low end, staying in the field: the "must fail" half of a check. */
export const tamperWord = (word: string) => toHex32(BigInt(word) ^ 1n);
