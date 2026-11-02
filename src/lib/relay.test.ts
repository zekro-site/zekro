import { test } from "node:test";
import assert from "node:assert/strict";
import { USDG } from "@/config/brand";
import { BOOK_TOPICS, MAX_BOOK_LOG_SPAN, MAX_CALL_DATA, checkBatch, logShape, runRelay } from "./relay";

const call = (to: string, data = "0x") => ({ method: "eth_call", params: [{ to, data }, "latest"] });
const BOOK = "0x00000000000000000000000000000000000abe15";
const targets = new Set([BOOK, USDG.address.toLowerCase()]);
const logs = (over: Record<string, unknown> = {}) => ({ method: "eth_getLogs", params: [{ address: BOOK, fromBlock: "0x1", toBlock: "0x10", topics: [BOOK_TOPICS[0]], ...over }] });

test("reads of known contracts are priced", () => {
  const out = checkBatch([call(USDG.address, "0x18160ddd")]);
  assert.ok("units" in out && out.units === 2);
});

test("unknown targets, signed transactions and wide log scans are refused", () => {
  assert.ok("error" in checkBatch([call("0x000000000000000000000000000000000000dead")]));
  assert.ok("error" in checkBatch([{ method: "eth_sendRawTransaction", params: ["0x02"] }]));
  assert.ok("error" in checkBatch([logs({ toBlock: "latest" })], targets, BOOK));
  assert.ok("error" in checkBatch([logs({ toBlock: `0x${(MAX_BOOK_LOG_SPAN + 1).toString(16)}` })], targets, BOOK));
});

test("only the book's exact log shapes pass", () => {
  assert.ok("units" in checkBatch([logs()], targets, BOOK));
  assert.ok("units" in checkBatch([logs({ topics: [BOOK_TOPICS, `0x${"0".repeat(63)}1`] })], targets, BOOK));
  assert.ok("error" in logShape(BOOK, [], BOOK));
  assert.ok("error" in logShape(BOOK, undefined, BOOK));
  assert.ok("error" in logShape(BOOK, [`0x${"a".repeat(64)}`], BOOK));
  assert.ok("error" in logShape(USDG.address, [BOOK_TOPICS[0]], BOOK));
  assert.ok("error" in logShape([BOOK, USDG.address], [BOOK_TOPICS[0]], BOOK));
  assert.ok("error" in logShape(BOOK, [BOOK_TOPICS[0], "0x1"], BOOK));
  assert.ok("error" in logShape(BOOK, [BOOK_TOPICS[0], `0x${"0".repeat(64)}`, `0x${"0".repeat(64)}`], BOOK));
  assert.ok("error" in logShape(BOOK, [BOOK_TOPICS[0]], ""));
});

test("a refused budget never reaches the RPC", async () => {
  let reached = false;
  const out = await runRelay(call(USDG.address, "0x18160ddd"), {
    charge: async () => "slow down",
    one: async () => {
      reached = true;
      return { result: "0x" };
    },
    many: async () => [],
  });
  assert.equal(out.status, 429);
  assert.equal(reached, false);
});

test("an unknown address is charged, then refused without reaching the RPC", async () => {
  let charged = 0;
  let reached = false;
  const out = await runRelay(call("0x00000000000000000000000000000000000a11ce", "0x18160ddd"), {
    charge: async (u) => {
      charged += u;
      return null;
    },
    one: async () => {
      reached = true;
      return { result: "0x" };
    },
    many: async () => [],
  });
  assert.equal(out.status, 400);
  assert.ok(charged > 0);
  assert.equal(reached, false);
});

test("eth_estimateGas is relayed only for the book", () => {
  const est = (tx: Record<string, unknown>) => ({ method: "eth_estimateGas", params: [tx] });
  assert.ok("error" in checkBatch([est({ to: USDG.address, data: "0x18160ddd" })], targets, BOOK));
  const ok = checkBatch([est({ to: BOOK, data: "0x18160ddd" })], targets, BOOK);
  assert.ok("units" in ok && ok.units === 3);
  assert.ok("error" in checkBatch([est({ data: "0x6080" })], targets, BOOK));
});

test("a proof check fits, costs more than a plain read, and call data has a ceiling", () => {
  const proofData = `0x${"ab".repeat(8384 + 200)}`;
  const heavy = checkBatch([call(BOOK, proofData)], targets, BOOK);
  assert.ok("units" in heavy && heavy.units > 2);
  assert.ok("error" in checkBatch([call(BOOK, `0x${"a".repeat(MAX_CALL_DATA)}`)], targets, BOOK));
});

test("calls with value, state overrides and gas above the cap are refused", () => {
  assert.ok("error" in checkBatch([{ method: "eth_call", params: [{ to: BOOK, data: "0x", value: "0x1" }, "latest"] }], targets, BOOK));
  assert.ok("error" in checkBatch([{ method: "eth_call", params: [{ to: BOOK, data: "0x" }, "latest", {}] }], targets, BOOK));
  assert.ok("error" in checkBatch([{ method: "eth_call", params: [{ to: BOOK, data: "0x", gas: "0xffffff" }, "latest"] }], targets, BOOK));
  assert.ok("error" in checkBatch([{ method: "eth_call", params: [{ to: BOOK, data: "0x", TO: USDG.address }, "latest"] }], targets, BOOK));
});
