// The deployment check against a fake chain built from the real artifacts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { match, put, verifyDeployment } from "./verify-lib.mjs";

const ART = JSON.parse(readFileSync(new URL("../src/lib/contracts/artifacts.json", import.meta.url), "utf8")).contracts;

const TAPE = "0x" + "a1".repeat(20);
const GATES = "0x" + "a2".repeat(20);
const CHECK = "0x" + "a3".repeat(20);
const BOOK = "0x" + "a4".repeat(20);
const addr = { ZekroFiatShamirTape: TAPE, ZekroGateRelations: GATES };
const word = (n) => BigInt(n).toString(16).padStart(64, "0");

const libCode = (name, at) => "0x73" + at.slice(2) + ART[name].runtime.slice(44);
function checkCode() {
  const a = ART.ZekroMemberCheck;
  const expected = a.expectedImmutables;
  return put(put(a.runtime, a.runtimeLinks, (r) => addr[r.lib].slice(2)), a.immutables, (r) => word(expected[r.name]));
}
function bookCode(checker = CHECK) {
  const a = ART.ZekroGroupBook;
  return put(a.runtime, a.immutables, () => word(BigInt(checker)));
}
const creation = "0x" + "11".repeat(0);

function chain(overrides = {}) {
  const codes = { [TAPE]: libCode("ZekroFiatShamirTape", TAPE), [GATES]: libCode("ZekroGateRelations", GATES), [CHECK]: checkCode(), [BOOK]: bookCode(), ...overrides };
  return async (method, params) => {
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_getCode") return codes[params[0].toLowerCase()] ?? "0x";
    throw new Error("unexpected " + method);
  };
}

test("artifact guards are present", () => {
  assert.equal(creation, "0x");
  assert.ok(match(ART, "ZekroGroupBook", bookCode(), BOOK));
  assert.equal(match(ART, "ZekroGroupBook", bookCode().slice(0, -2) + "ff", BOOK), null);
});

test("a clean deployment matches and walks the verifier and both libraries", async () => {
  const r = await verifyDeployment({ target: BOOK, rpc: chain(), ART });
  assert.equal(r.ok, true, r.lines.join("\n"));
  assert.equal(r.kind, "ZekroGroupBook");
  assert.ok(r.lines.some((l) => l.includes("ZekroMemberCheck at")));
  assert.ok(r.lines.some((l) => l.includes("ZekroFiatShamirTape at")));
  assert.ok(r.lines.some((l) => l.includes("ZekroGateRelations at")));
  assert.ok(r.lines.some((l) => l.includes("$VK_HASH")));
});

test("a book pointing at a different checker fails", async () => {
  const other = "0x" + "b1".repeat(20);
  const r = await verifyDeployment({ target: BOOK, kind: "ZekroGroupBook", rpc: chain({ [BOOK]: bookCode(other) }), ART });
  assert.equal(r.ok, false);
});

test("a changed verification key fails", async () => {
  const a = ART.ZekroMemberCheck;
  const code = put(put(a.runtime, a.runtimeLinks, (r) => addr[r.lib].slice(2)), a.immutables, (r) => word(r.name === "$VK_HASH" ? 1 : a.expectedImmutables[r.name]));
  const r = await verifyDeployment({ target: CHECK, kind: "ZekroMemberCheck", rpc: chain({ [CHECK]: code }), ART });
  assert.equal(r.ok, false);
});

test("a linked library with other code fails", async () => {
  const r = await verifyDeployment({ target: CHECK, kind: "ZekroMemberCheck", rpc: chain({ [TAPE]: "0x6000" }), ART });
  assert.equal(r.ok, false);
});

test("wrong chain, no code, junk address and unknown kind all fail closed", async () => {
  const wrong = await verifyDeployment({ target: BOOK, rpc: async (m, p) => (m === "eth_chainId" ? "0x1" : chain()(m, p)), ART });
  assert.equal(wrong.ok, false);
  assert.equal((await verifyDeployment({ target: "0x" + "cc".repeat(20), rpc: chain(), ART })).ok, false);
  assert.equal((await verifyDeployment({ target: "nope", rpc: chain(), ART })).ok, false);
  assert.equal((await verifyDeployment({ target: BOOK, kind: "Other", rpc: chain(), ART })).ok, false);
  assert.equal((await verifyDeployment({ target: BOOK, rpc: async () => { throw new Error("down"); }, ART })).ok, false);
});

test("creation input is checked against this build and the constructor argument", async () => {
  const a = ART.ZekroGroupBook;
  const hash = "0x" + "de".repeat(32);
  const base = chain();
  const rpc = (input, status = "0x1", created = BOOK) => async (m, p) => {
    if (m === "eth_getTransactionByHash") return { hash, to: null, input };
    if (m === "eth_getTransactionReceipt") return { status, contractAddress: created };
    return base(m, p);
  };
  const good = a.creation + word(BigInt(CHECK));
  assert.equal((await verifyDeployment({ target: BOOK, kind: "ZekroGroupBook", tx: hash, rpc: rpc(good), ART })).ok, true);
  assert.equal((await verifyDeployment({ target: BOOK, kind: "ZekroGroupBook", tx: hash, rpc: rpc(a.creation + word(1)), ART })).ok, false);
  assert.equal((await verifyDeployment({ target: BOOK, kind: "ZekroGroupBook", tx: hash, rpc: rpc(good, "0x0"), ART })).ok, false);
  assert.equal((await verifyDeployment({ target: BOOK, kind: "ZekroGroupBook", tx: hash, rpc: rpc(good, "0x1", CHECK), ART })).ok, false);
  assert.equal((await verifyDeployment({ target: BOOK, kind: "ZekroGroupBook", tx: "0x12", rpc: rpc(good), ART })).ok, false);
});
