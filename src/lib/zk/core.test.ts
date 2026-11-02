import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIELD,
  TREE_DEPTH,
  ZERO_DIGEST,
  commitmentOf,
  decodeIdentity,
  encodeIdentity,
  hash2,
  makeBundle,
  membershipWitness,
  newIdentity,
  nextDigest,
  nullifierOf,
  parseBundle,
  pathOf,
  replayList,
  rootOf,
  scopeFieldOf,
  signalOf,
  tamperWord,
  toHex32,
  zeros,
} from "./core.ts";

const walk = (leaf: bigint, p: { elements: bigint[]; indices: number[] }) => {
  let node = leaf;
  for (let i = 0; i < TREE_DEPTH; i++) node = p.indices[i] ? hash2(p.elements[i], node) : hash2(node, p.elements[i]);
  return node;
};

test("poseidon matches the circomlib vector pinned in the circuit", () => {
  assert.equal(hash2(1n, 2n), 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189an);
});

test("every path of a list walks back to its root", () => {
  const leaves = Array.from({ length: 21 }, (_, i) => hash2(BigInt(i + 1), 9n));
  const root = rootOf(leaves);
  for (const i of [0, 1, 2, 7, 13, 20]) assert.equal(walk(leaves[i], pathOf(leaves, i)), root);
});

test("a list of one matches the empty-path build in the circuit tests", () => {
  const a = hash2(11n, 22n);
  let node = a;
  for (let i = 0; i < TREE_DEPTH; i++) node = hash2(node, zeros()[i]);
  assert.equal(rootOf([a]), node);
});

test("a cleared leaf changes the root and has no path", () => {
  const leaves = [hash2(1n, 1n), hash2(2n, 2n), hash2(3n, 3n)];
  const cleared = [leaves[0], 0n, leaves[2]];
  assert.notEqual(rootOf(leaves), rootOf(cleared));
  assert.throws(() => pathOf(cleared, 1));
  assert.equal(walk(cleared[2], pathOf(cleared, 2)), rootOf(cleared));
});

test("clearing the last leaf equals the tree without it", () => {
  const a = hash2(1n, 1n);
  const b = hash2(2n, 2n);
  assert.equal(rootOf([a, 0n]), rootOf([a]));
  assert.notEqual(rootOf([a, b]), rootOf([a]));
});

test("identity backup round trip, and strangers are refused", () => {
  const id = newIdentity();
  assert.deepEqual(decodeIdentity(encodeIdentity(id)), id);
  assert.throws(() => decodeIdentity("zekro-id-1:0x12:0x34"));
  assert.throws(() => decodeIdentity(`zekro-id-1:${toHex32(FIELD)}:${toHex32(1n)}`));
  assert.throws(() => decodeIdentity(`zekro-id-1:${toHex32(0n)}:${toHex32(1n)}`));
});

test("nullifier depends on secret and scope, not on the salt or the signal", () => {
  const id = newIdentity();
  const other = { ...id, salt: id.salt + 1n };
  assert.equal(nullifierOf(id.secret, 5n), nullifierOf(other.secret, 5n));
  assert.notEqual(nullifierOf(id.secret, 5n), nullifierOf(id.secret, 6n));
});

test("witness refuses a stranger and an oversized signal", () => {
  const me = newIdentity();
  const list = [commitmentOf(newIdentity()), commitmentOf(me)];
  const { index, values, witness } = membershipWitness(me, list, 7n, signalOf("hello"));
  assert.equal(index, 1);
  assert.equal(values.root, rootOf(list));
  assert.equal((witness.path_elements as string[]).length, TREE_DEPTH);
  assert.throws(() => membershipWitness(newIdentity(), list, 7n, 1n), /not in that list/);
  assert.throws(() => membershipWitness(me, list, 1n << 248n, 1n), /248 bits/);
});

test("signal and scope always fit 248 bits", () => {
  for (const m of ["", "a", "a longer message with spaces"]) assert.equal(signalOf(m) >> 248n, 0n);
  assert.equal(scopeFieldOf(4663, "0x0000000000000000000000000000000000000001", 1n, 1n) >> 248n, 0n);
  assert.notEqual(scopeFieldOf(4663, "0x0000000000000000000000000000000000000001", 1n, 1n), scopeFieldOf(4663, "0x0000000000000000000000000000000000000001", 1n, 2n));
});

test("replay rebuilds leaves and digest in event order", () => {
  const a = hash2(1n, 1n);
  const b = hash2(2n, 2n);
  const { leaves, digest } = replayList([
    { kind: "add", index: 0, commitment: a },
    { kind: "add", index: 1, commitment: b },
    { kind: "clear", index: 0, commitment: a },
  ]);
  assert.deepEqual(leaves, [0n, b]);
  let d = nextDigest(ZERO_DIGEST, { kind: "add", index: 0, commitment: a });
  d = nextDigest(d, { kind: "add", index: 1, commitment: b });
  d = nextDigest(d, { kind: "clear", index: 0, commitment: a });
  assert.equal(digest, d);
});

test("bundle parser accepts its own output and refuses secrets and junk", () => {
  const v = { root: 1n, scope: 2n, nullifier: 3n, signal: 4n };
  const b = makeBundle("0xabcd", v, "hi");
  assert.deepEqual(parseBundle(JSON.stringify(b)), b);
  assert.throws(() => parseBundle("nope"));
  assert.throws(() => parseBundle(JSON.stringify({ ...b, secret: "0x01" })), /secret/);
  assert.throws(() => parseBundle(JSON.stringify({ ...b, kind: "other" })));
  assert.throws(() => parseBundle(JSON.stringify({ ...b, root: toHex32(FIELD) })), /field/);
  assert.throws(() => parseBundle(JSON.stringify({ ...b, proof: "0xzz" })));
  assert.equal(BigInt(tamperWord(b.root)), 0n);
});
