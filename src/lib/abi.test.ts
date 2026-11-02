import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toFunctionSelector, toEventSelector, toFunctionSignature, toEventSignature, type AbiFunction, type AbiEvent } from "viem";
import { ALL_ERRORS, BOOK_ABI, ERROR_WORDS } from "./abi";

const ART = JSON.parse(readFileSync(new URL("./contracts/artifacts.json", import.meta.url), "utf8")).contracts.ZekroGroupBook.abi as readonly { type: string; name: string }[];

test("every function the site uses matches the compiled contract", () => {
  const built = new Set(ART.filter((x) => x.type === "function").map((x) => toFunctionSelector(x as AbiFunction)));
  for (const x of BOOK_ABI) if (x.type === "function") assert.ok(built.has(toFunctionSelector(x)), toFunctionSignature(x));
});

test("every event matches the compiled contract, and none is missing", () => {
  const built = new Set(ART.filter((x) => x.type === "event").map((x) => toEventSelector(x as AbiEvent)));
  const ours = BOOK_ABI.filter((x) => x.type === "event");
  for (const x of ours) assert.ok(built.has(toEventSelector(x)), toEventSignature(x));
  assert.equal(ours.length, built.size);
});

test("every custom error has a compiled match and plain words", () => {
  const built = new Set(ART.filter((x) => x.type === "error").map((x) => x.name));
  assert.equal(ALL_ERRORS.length, built.size);
  for (const e of ALL_ERRORS) {
    assert.ok(built.has(e.name), e.name);
    if (e.name !== "CheckerHasNoCode") assert.ok(ERROR_WORDS[e.name], e.name);
  }
});
