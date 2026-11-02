import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS, emptyPractice, parseCommitments, practice, rootMatchesList, usableRoots } from "./book";
import { FIELD, ZERO_DIGEST, commitmentOf, newIdentity, nextDigest, rootOf } from "./zk/core";

const NOW = 1_000;
function ready() {
  const a = commitmentOf(newIdentity());
  const b = commitmentOf(newIdentity());
  const created = practice.create(emptyPractice(), "Readers", false, NOW);
  const id = created.id;
  let state = practice.add(created.state, id, [a, b]);
  const d = practice.detail(state, id)!;
  state = practice.publish(state, id, rootOf(d.leaves), d.group.digest, NOW);
  state = practice.openScope(state, id, "round one", 0, NOW);
  return { state, id, a, b };
}

test("a group moves Forming to Active on its first root", () => {
  const { state, id } = practice.create(emptyPractice(), "G", false, NOW);
  assert.equal(practice.detail(state, id)!.group.status, STATUS.Forming);
  const s = ready();
  assert.equal(practice.detail(s.state, s.id)!.group.status, STATUS.Active);
});

test("the digest matches the contract's formula", () => {
  const s = ready();
  let d = nextDigest(ZERO_DIGEST, { kind: "add", index: 0, commitment: s.a });
  d = nextDigest(d, { kind: "add", index: 1, commitment: s.b });
  assert.equal(practice.detail(s.state, s.id)!.group.digest, d);
});

test("practice keeps the contract's refusals", () => {
  const s = ready();
  assert.throws(() => practice.create(emptyPractice(), "", false, NOW));
  assert.throws(() => practice.create(emptyPractice(), "x".repeat(33), false, NOW));
  assert.throws(() => practice.add(s.state, s.id, [s.a]), /already added/);
  assert.throws(() => practice.add(s.state, s.id, [0n]));
  assert.throws(() => practice.add(s.state, 9, [1n]));
  assert.throws(() => practice.publish(s.state, s.id, 5n, ZERO_DIGEST, NOW), /list changed/);
  assert.throws(() => practice.openScope(s.state, s.id, "x", 5, NOW));
  assert.throws(() => practice.closeScope(s.state, s.id, 9));
  assert.throws(() => practice.revoke(s.state, s.id, 9));
});

test("one nullifier per scope, and only an open scope in an active group", () => {
  const s = ready();
  let st = practice.record(s.state, s.id, 1, 1, 77n, NOW);
  assert.throws(() => practice.record(st, s.id, 1, 1, 77n, NOW), /already proved/);
  st = practice.openScope(st, s.id, "round two", 0, NOW);
  st = practice.record(st, s.id, 2, 1, 77n, NOW);
  assert.equal(st.proofs, 2);
  const paused = practice.setStatus(st, s.id, "pause");
  assert.throws(() => practice.record(paused, s.id, 1, 1, 78n, NOW));
  const closed = practice.closeScope(st, s.id, 1);
  assert.throws(() => practice.record(closed, s.id, 1, 1, 78n, NOW), /not open/);
  const revoked = practice.revoke(st, s.id, 1);
  assert.throws(() => practice.record(revoked, s.id, 1, 1, 78n, NOW), /revoked/);
  const retired = practice.setStatus(st, s.id, "retire");
  assert.throws(() => practice.add(retired, s.id, [9n]));
  assert.throws(() => practice.setStatus(retired, s.id, "resume"));
});

test("clearing a leaf changes the root and the digest", () => {
  const s = ready();
  const before = practice.detail(s.state, s.id)!;
  const st = practice.clear(s.state, s.id, 0);
  const after = practice.detail(st, s.id)!;
  assert.equal(after.leaves[0], 0n);
  assert.notEqual(after.group.digest, before.group.digest);
  assert.notEqual(rootOf(after.leaves), rootOf(before.leaves));
  assert.throws(() => practice.clear(st, s.id, 0));
  assert.equal(rootMatchesList(after.roots.at(-1), rootOf(after.leaves), after.group.digest), "older-list");
  assert.throws(() => practice.add(st, s.id, [s.a]), /already added/);
});

test("root status tells a match, a mismatch, an older list and no root apart", () => {
  const s = ready();
  const d = practice.detail(s.state, s.id)!;
  const latest = d.roots.at(-1);
  assert.equal(rootMatchesList(latest, rootOf(d.leaves), d.group.digest), "match");
  assert.equal(rootMatchesList(latest, 5n, d.group.digest), "mismatch");
  assert.equal(rootMatchesList(undefined, 5n, d.group.digest), "none");
});

test("usable roots are the newest thirty-two that are not revoked", () => {
  const s = ready();
  let st = s.state;
  const digest = practice.detail(st, s.id)!.group.digest;
  for (let i = 0; i < 33; i++) st = practice.publish(st, s.id, BigInt(i + 10), digest, NOW);
  st = practice.revoke(st, s.id, 34);
  const u = usableRoots(practice.detail(st, s.id)!);
  assert.equal(u.length, 31);
  assert.equal(u[0].seq, 33);
  assert.equal(u.at(-1)!.seq, 3);
  assert.throws(() => practice.record(st, s.id, 1, 1, 5n, NOW), /32 roots old/);
});

test("the commitment list parser takes lines and commas and names the bad entry", () => {
  assert.deepEqual(parseCommitments("0x01, 2\n3"), [1n, 2n, 3n]);
  assert.throws(() => parseCommitments("nope"), /nope/);
  assert.throws(() => parseCommitments("0"), /field/);
  assert.throws(() => parseCommitments(FIELD.toString()), /field/);
});
