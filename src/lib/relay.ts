import { toEventSelector } from "viem";
import { BRAND, ETH_USD_FEED, USDG, WETH, isAddress } from "@/config/brand";
import { CONTRACTS } from "@/config/contracts";

/*
 * Rules for the read-only JSON-RPC relay, kept apart from the route so they can be tested. Every request is priced
 * in units; each network has a budget and the whole site has a ceiling. Only the exact request shapes the site
 * itself issues pass:
 *   - eth_call to the contracts the site reads (stablecoin, WETH, price feed, the token, the Zekro book and verifier);
 *   - eth_estimateGas on the Zekro book only;
 *   - eth_getLogs in one shape: the book's own events by event signature, optionally narrowed to one group.
 * It never forwards a signed transaction.
 */

export const MAX_CALLS = 20;
export const MAX_LOGS_PER_BATCH = 3;
/** Widest single query on the book. */
export const MAX_BOOK_LOG_SPAN = 20_000;
/** Total blocks one batch may cover. */
export const MAX_BATCH_SPAN = 60_000;
export const MAX_GAS = 5_000_000;
const GAS_CAP_HEX = `0x${MAX_GAS.toString(16)}`;
const CALL_KEYS = new Set(["from", "to", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "value", "data", "input", "nonce", "type", "chainId"]);
const LOG_KEYS = new Set(["address", "fromBlock", "toBlock", "topics", "blockHash"]);
const BLOCK_TAG = /^(latest|pending|safe|finalized|0x[0-9a-fA-F]{1,16})$/;

/**
 * Normalises a call object before it is checked and forwarded. The node reads `input` as well as `data`, so `input`
 * is folded into `data` (refused when the two disagree) and every check sees the bytes that will run; a call without
 * `gas` gets the relay cap. Mutates `tx`; running it twice is harmless.
 */
function shapeTx(tx: Record<string, unknown>, cap = GAS_CAP_HEX): string | null {
  // The node decodes field names case-insensitively ("TO" would override "to"), so only these exact names pass.
  for (const k of Object.keys(tx)) if (!CALL_KEYS.has(k)) return `Unsupported call field: ${k.slice(0, 32)}`;
  if (tx.input !== undefined) {
    if (tx.data !== undefined && tx.data !== tx.input) return "data and input disagree.";
    tx.data = tx.input;
    delete tx.input;
  }
  if (tx.data !== undefined && (typeof tx.data !== "string" || !/^0x[0-9a-fA-F]*$/.test(tx.data))) return "Call data must be hex.";
  if (tx.value !== undefined && !(typeof tx.value === "string" && /^0x0*$/.test(tx.value))) return "Calls with value are not relayed.";
  if (tx.gas === undefined) tx.gas = cap;
  return null;
}
export const MAX_BODY = 131_072;
export const BUDGET = { units: 2_000, windowSec: 600, siteUnits: 40_000 };

export const COST: Record<string, number> = {
  eth_getLogs: 10,
  eth_call: 2,
  eth_getTransactionReceipt: 1,
  eth_getTransactionByHash: 1,
  eth_blockNumber: 1,
  eth_getBalance: 1,
  eth_chainId: 1,
  eth_gasPrice: 1,
  eth_getBlockByNumber: 1,
  eth_getTransactionCount: 1,
  eth_maxPriorityFeePerGas: 1,
  eth_getCode: 1,
  eth_estimateGas: 3,
};

/** Call data limit in hex characters: a proof is 8,384 bytes, and a precheck or a submit dry run carries one. */
export const MAX_CALL_DATA = 24_000;

/** Contracts the browser reads through the relay by address. eth_getCode and receipts are answered for any address. */
export function readTargets() {
  const list: string[] = [USDG.address, WETH, ETH_USD_FEED];
  if (isAddress(BRAND.ca)) list.push(BRAND.ca);
  for (const a of [CONTRACTS.book, CONTRACTS.checker, CONTRACTS.tape, CONTRACTS.gates]) if (isAddress(a)) list.push(a);
  return new Set(list.map((a) => a.toLowerCase()));
}

/** Addresses a batch reads (eth_call targets and log filter addresses), lowercased. */
export function namedAddresses(body: Call | Call[]): string[] {
  const calls = Array.isArray(body) ? body : [body];
  const out = new Set<string>();
  for (const c of calls) {
    if (!c || !Array.isArray(c.params)) continue;
    const first = c.params[0] as { to?: unknown; address?: unknown } | undefined;
    if (!first || typeof first !== "object") continue;
    if ((c.method === "eth_call" || c.method === "eth_estimateGas") && typeof first.to === "string") out.add(first.to.toLowerCase());
    if (c.method === "eth_getLogs") {
      const a = first.address;
      for (const x of typeof a === "string" ? [a] : Array.isArray(a) ? a : []) if (typeof x === "string") out.add(x.toLowerCase());
    }
  }
  return [...out].filter((a) => /^0x[0-9a-f]{40}$/.test(a));
}

const TOPIC = /^0x[0-9a-f]{64}$/;
export const BOOK_TOPICS = [
  "GroupCreated(uint256,address,string,bytes32,bool)",
  "GroupStatusChanged(uint256,uint8)",
  "RoleChanged(uint256,address,uint8)",
  "CommitmentAdded(uint256,uint256,uint256,bytes32)",
  "CommitmentCleared(uint256,uint256,uint256,bytes32)",
  "RootPublished(uint256,uint256,uint256,bytes32,uint32)",
  "RootRevoked(uint256,uint256)",
  "ScopeOpened(uint256,uint256,uint256,uint64,string)",
  "ScopeClosed(uint256,uint256)",
  "ProofAccepted(uint256,uint256,uint256,uint256,uint256,address,string)",
].map((s) => toEventSelector(s));

const asList = (v: unknown): unknown[] | null => (typeof v === "string" ? [v] : Array.isArray(v) ? v : null);

/** A log filter passes only as the site issues it: the book's address, its event signatures, at most one group. */
export function logShape(address: unknown, topics: unknown, book: string = CONTRACTS.book): { shape: "book" } | { error: string } {
  if (!Array.isArray(topics) || topics.length < 1 || topics.length > 2) return { error: "Log queries take topics [events] or [events, group]." };
  const addrs = asList(address);
  if (!addrs || addrs.length !== 1 || typeof addrs[0] !== "string") return { error: "eth_getLogs takes one address." };
  if (!isAddress(book) || addrs[0].toLowerCase() !== book.toLowerCase()) return { error: "eth_getLogs address not served by this relay." };
  const first = asList(topics[0]);
  if (!first || first.length < 1 || first.length > BOOK_TOPICS.length || !first.every((t) => typeof t === "string" && BOOK_TOPICS.includes(t.toLowerCase() as `0x${string}`))) return { error: "Log queries must name the book's events." };
  if (topics.length === 2) {
    const g = asList(topics[1]);
    if (!g || g.length !== 1 || typeof g[0] !== "string" || !TOPIC.test(g[0].toLowerCase())) return { error: "Log queries take one group in topic 1." };
  }
  return { shape: "book" };
}

export type Call = { jsonrpc?: string; id?: unknown; method: string; params?: unknown[] };

const hexBlock = (v: unknown) => (typeof v === "string" && /^0x[0-9a-fA-F]{1,16}$/.test(v) ? Number(BigInt(v)) : null);
const gasOf = (g: unknown) => (typeof g === "string" && /^0x[0-9a-fA-F]{1,16}$/.test(g) ? Number(BigInt(g)) : Infinity);

/** Checks a batch and returns its cost in units, or the reason it is refused. */
export function checkBatch(calls: Call[], targets = readTargets(), book: string = CONTRACTS.book): { units: number } | { error: string } {
  if (calls.length === 0 || calls.length > MAX_CALLS) return { error: `Between 1 and ${MAX_CALLS} calls per request.` };
  let units = 0;
  let logs = 0;
  let span = 0;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (!c || typeof c.method !== "string" || !Object.hasOwn(COST, c.method)) return { error: `Method not allowed: ${String(c?.method)}` };
    if (c.params !== undefined && !Array.isArray(c.params)) return { error: "params must be an array." };
    const params = c.params ?? [];
    units += COST[c.method];
    if (c.method === "eth_getLogs") {
      logs += 1;
      if (logs > MAX_LOGS_PER_BATCH) return { error: `At most ${MAX_LOGS_PER_BATCH} log queries per request.` };
      const filter = (params[0] ?? {}) as { address?: unknown; fromBlock?: unknown; toBlock?: unknown; blockHash?: unknown; topics?: unknown };
      if (typeof filter !== "object" || filter === null || Array.isArray(filter)) return { error: "eth_getLogs needs a filter object." };
      const oddKey = Object.keys(filter).find((k) => !LOG_KEYS.has(k));
      if (oddKey) return { error: `Unsupported filter field: ${oddKey.slice(0, 32)}` };
      if (filter.blockHash !== undefined) return { error: "blockHash filters are not relayed." };
      const shaped = logShape(filter.address, filter.topics, book);
      if ("error" in shaped) return { error: shaped.error };
      if (!targets.has((asList(filter.address)?.[0] as string).toLowerCase())) return { error: "eth_getLogs address not served by this relay." };
      // Both ends must be hex numbers: "latest" or a missing bound would let one request scan the whole chain.
      const from = hexBlock(filter.fromBlock);
      const to = hexBlock(filter.toBlock);
      if (from === null || to === null) return { error: "eth_getLogs needs numeric fromBlock and toBlock." };
      if (to < from) return { error: "toBlock is before fromBlock." };
      const width = to - from + 1;
      if (width > MAX_BOOK_LOG_SPAN) return { error: "Log range too wide." };
      span += width;
      if (span > MAX_BATCH_SPAN) return { error: "Log range too wide." };
      units += Math.ceil(width / 1_000);
    }
    if (c.method === "eth_call" || c.method === "eth_estimateGas") {
      if (params.length > 2) return { error: "State overrides are not relayed." };
      const tx = params[0] as { to?: unknown; gas?: unknown; data?: unknown } | undefined;
      if (!tx || typeof tx !== "object" || typeof tx.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(tx.to)) return { error: `${c.method} needs a target address.` };
      const to = tx.to.toLowerCase();
      if (!targets.has(to)) return { error: `${c.method} target not served by this relay.` };
      if (c.method === "eth_estimateGas" && !(isAddress(book) && to === book.toLowerCase())) return { error: "eth_estimateGas is relayed only for the book." };
      const shaped = shapeTx(tx as Record<string, unknown>, GAS_CAP_HEX);
      if (shaped) return { error: shaped };
      if (params[1] !== undefined && !(typeof params[1] === "string" && BLOCK_TAG.test(params[1]))) return { error: "Unsupported block tag." };
      if (gasOf(tx.gas) > MAX_GAS) return { error: "Gas above the relay cap." };
      const d = typeof tx.data === "string" ? tx.data : "0x";
      if (d.length > MAX_CALL_DATA) return { error: "Call data too large." };
      // A proof check is the heaviest read here: it runs the whole verifier.
      if (d.length > 4_000) units += 20;
    }
    if (c.method === "eth_getBlockByNumber" && params[1] !== false) return { error: "eth_getBlockByNumber is relayed only with full transactions off (false)." };
  }
  return { units };
}

export type RpcAnswer = { result: unknown } | { error: { code: number; message: string; data?: string } } | { down: true };

export type RelayDeps = {
  /** Charges the caller's budgets; returns the refusal message, or null when allowed. */
  charge: (units: number) => Promise<string | null>;
  one: (method: string, params: unknown[]) => Promise<RpcAnswer>;
  many: (calls: { method: string; params: unknown[] }[]) => Promise<(unknown | null)[]>;
};

/**
 * The relay's whole decision, without I/O of its own: shape and price first, then the budget, then
 * the target allowlist, and only then the upstream RPC. A refused request never reaches the RPC.
 */
export async function runRelay(body: Call | Call[], deps: RelayDeps): Promise<{ status: number; body: unknown }> {
  const calls = Array.isArray(body) ? body : [body];
  const targets = readTargets();
  // Priced with every named address allowed first, so a refused target still costs budget.
  const priced = checkBatch(calls, new Set([...targets, ...namedAddresses(body)]));
  if ("error" in priced) return { status: 400, body: { error: priced.error } };
  const refused = await deps.charge(priced.units);
  if (refused) return { status: 429, body: { error: refused } };
  const checked = checkBatch(calls, targets);
  if ("error" in checked) return { status: 400, body: { error: checked.error } };
  if (calls.length === 1 && !Array.isArray(body)) {
    const c = calls[0];
    const a = await deps.one(c.method, c.params ?? []);
    if ("down" in a) return { status: 502, body: { error: "The chain could not be reached." } };
    return { status: 200, body: { jsonrpc: "2.0", id: c.id ?? null, ...a } };
  }
  try {
    const results = await deps.many(calls.map((c) => ({ method: c.method, params: c.params ?? [] })));
    const out = calls.map((c, i) =>
      results[i] === null ? { jsonrpc: "2.0", id: c.id ?? null, error: { code: -32000, message: "read failed" } } : { jsonrpc: "2.0", id: c.id ?? null, result: results[i] },
    );
    return { status: 200, body: Array.isArray(body) ? out : out[0] };
  } catch {
    return { status: 502, body: { error: "The chain could not be reached." } };
  }
}
