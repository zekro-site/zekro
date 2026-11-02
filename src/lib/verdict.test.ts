import { test } from "node:test";
import assert from "node:assert/strict";
import { VERDICT_TITLES, judgeBundle, judgeTx, rootAgedOut, type BundleFacts, type TxFacts } from "./verdict";

const bound = { rootMatches: true, scopeMatches: true, revoked: false, tooOld: false };
const bundle = (over: Partial<BundleFacts> = {}): BundleFacts => ({ proofValid: true, signalMatches: true, chainValid: true, bound, ...over });
const tx = (over: Partial<TxFacts> = {}): TxFacts => ({ proofValid: true, receiptStatus: "0x1", scopeMatches: true, chainValid: true, revoked: false, tooOld: false, noteMatches: true, ...over });

test("only a bound proof on a standing root says it checks out", () => {
  assert.equal(judgeBundle(bundle()).verdict, "current");
  assert.equal(judgeBundle(bundle()).title, "This proof checks out.");
  assert.equal(judgeTx(tx()).verdict, "current");
});

test("no book reference: valid maths, not tied to any group, never checks out", () => {
  const r = judgeBundle(bundle({ bound: null, chainValid: null }));
  assert.equal(r.verdict, "unbound");
  assert.notEqual(r.title, VERDICT_TITLES.current);
  assert.match(r.reasons[0], /tree of their own/);
});

test("revoked root: a bundle is not current membership, even with a good proof", () => {
  const r = judgeBundle(bundle({ bound: { ...bound, revoked: true } }));
  assert.equal(r.verdict, "historic");
  assert.notEqual(r.title, VERDICT_TITLES.current);
});

test("a root that aged out is not current membership", () => {
  assert.equal(judgeBundle(bundle({ bound: { ...bound, tooOld: true } })).verdict, "historic");
  assert.equal(judgeTx(tx({ tooOld: true })).verdict, "historic");
  assert.equal(rootAgedOut(1, 32), false);
  assert.equal(rootAgedOut(1, 33), true);
});

test("revoked root on a transaction: valid when sent, since revoked", () => {
  const r = judgeTx(tx({ revoked: true }));
  assert.equal(r.verdict, "historic");
  assert.match(r.reasons[0], /when sent/);
});

test("a note that does not match the signal fails the transaction verdict", () => {
  const r = judgeTx(tx({ noteMatches: false }));
  assert.equal(r.verdict, "invalid");
  assert.match(r.reasons[0], /does not match the signal/);
  assert.equal(judgeTx(tx({ noteMatches: null })).verdict, "current");
});

test("a failed or missing receipt fails the transaction verdict", () => {
  assert.equal(judgeTx(tx({ receiptStatus: "0x0" })).verdict, "invalid");
  assert.equal(judgeTx(tx({ receiptStatus: null })).verdict, "invalid");
});

test("every other failed check fails the verdict, and failure outranks every softer state", () => {
  assert.equal(judgeTx(tx({ proofValid: false })).verdict, "invalid");
  assert.equal(judgeTx(tx({ scopeMatches: false })).verdict, "invalid");
  assert.equal(judgeTx(tx({ chainValid: false })).verdict, "invalid");
  assert.equal(judgeTx(tx({ chainValid: null })).verdict, "current");
  assert.equal(judgeTx(tx({ revoked: true, noteMatches: false })).verdict, "invalid");
  assert.equal(judgeBundle(bundle({ proofValid: false })).verdict, "invalid");
  assert.equal(judgeBundle(bundle({ signalMatches: false })).verdict, "invalid");
  assert.equal(judgeBundle(bundle({ chainValid: false })).verdict, "invalid");
  assert.equal(judgeBundle(bundle({ bound: { ...bound, rootMatches: false } })).verdict, "invalid");
  assert.equal(judgeBundle(bundle({ bound: { ...bound, scopeMatches: false } })).verdict, "invalid");
  assert.equal(judgeBundle(bundle({ bound: { ...bound, rootMatches: false, revoked: true } })).verdict, "invalid");
  assert.equal(judgeBundle(bundle({ bound: null, proofValid: false })).verdict, "invalid");
  assert.equal(judgeBundle(bundle({ bound: null, otherContract: true })).verdict, "invalid");
});
