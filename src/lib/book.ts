import { MAX_LEAVES, ROOT_HISTORY, FIELD, ZERO_DIGEST, nextDigest, practiceScope, toHex32 } from "@/lib/zk/core";
import { ERROR_WORDS } from "@/lib/abi";

/*
 * The studio's view of a group book, and the practice book: the same rules as ZekroGroupBook.sol, kept in this browser,
 * for use before the contracts are deployed. Practice proofs are real proofs, checked with the same verification key;
 * only the record of them is local. Pure and JSON-safe so the tests can drive it.
 */

export const STATUS = { Forming: 0, Active: 1, Paused: 2, Retired: 3 } as const;
export const STATUS_NAMES = ["Forming", "Active", "Paused", "Retired"] as const;
export const SCOPE_OPEN = 1;
export const SCOPE_CLOSED = 2;

export type GroupView = {
  id: number;
  name: string;
  admin: string;
  status: number;
  openEnrollment: boolean;
  leafCount: number;
  rootCount: number;
  scopeCount: number;
  digest: `0x${string}`;
  createdAt: number;
};
export type RootView = { seq: number; root: bigint; digest: `0x${string}`; leafCount: number; publishedAt: number; revoked: boolean };
export type ScopeView = { id: number; label: string; status: number; closesAt: number; proofs: number; field: bigint };
export type GroupDetail = { group: GroupView; leaves: bigint[]; roots: RootView[]; scopes: ScopeView[] };

/* ------------------------------------------------------------------ practice book */

type StoredRoot = { seq: number; root: string; digest: `0x${string}`; leafCount: number; publishedAt: number; revoked: boolean };
type StoredScope = { id: number; label: string; status: number; closesAt: number; proofs: number; field: string; nullifiers: string[] };
type StoredGroup = { id: number; name: string; status: number; openEnrollment: boolean; digest: `0x${string}`; createdAt: number; leaves: string[]; seen: string[]; roots: StoredRoot[]; scopes: StoredScope[] };
export type PracticeState = { v: 1; groups: StoredGroup[]; proofs: number };

export const PRACTICE_ADMIN = "this browser";
export const emptyPractice = (): PracticeState => ({ v: 1, groups: [], proofs: 0 });

const refuse = (name: keyof typeof ERROR_WORDS): never => {
  throw new Error(ERROR_WORDS[name]);
};
const printable = (s: string, max: number) => s.length > 0 && s.length <= max && /^[\x20-\x7e]+$/.test(s);

/** The state is plain JSON; every action works on a fresh copy so a refused one changes nothing. */
const copyOf = (state: PracticeState): PracticeState => JSON.parse(JSON.stringify(state)) as PracticeState;

function find(state: PracticeState, id: number): StoredGroup {
  const g = state.groups.find((x) => x.id === id);
  if (!g) return refuse("UnknownGroup");
  return g;
}
const notRetired = (g: StoredGroup) => {
  if (g.status === STATUS.Retired) refuse("WrongStatus");
};

/** Parses one commitment per line, or comma separated; throws in plain words on the first bad entry. */
export function parseCommitments(text: string): bigint[] {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  return parts.map((p) => {
    let n: bigint;
    try {
      n = BigInt(p);
    } catch {
      throw new Error(`"${p.slice(0, 20)}" is not a number.`);
    }
    if (n === 0n || n >= FIELD) throw new Error(`"${p.slice(0, 20)}" is outside the field.`);
    return n;
  });
}

export const practice = {
  create(state: PracticeState, name: string, openEnrollment: boolean, now: number): { state: PracticeState; id: number } {
    if (!printable(name, 32)) refuse("BadName");
    const next = copyOf(state);
    const id = next.groups.length + 1;
    next.groups.push({ id, name, status: STATUS.Forming, openEnrollment, digest: ZERO_DIGEST, createdAt: now, leaves: [], seen: [], roots: [], scopes: [] });
    return { state: next, id };
  },
  add(state: PracticeState, id: number, commitments: bigint[]): PracticeState {
    const next = copyOf(state);
    const g = find(next, id);
    notRetired(g);
    if (commitments.length === 0 || commitments.length > 128) refuse("BatchSize");
    if (g.leaves.length + commitments.length > MAX_LEAVES) refuse("TreeFull");
    for (const c of commitments) {
      if (c === 0n || c >= FIELD) refuse("BadCommitment");
      const h = toHex32(c);
      if (g.seen.includes(h)) refuse("CommitmentAlreadyAdded");
      g.seen.push(h);
      g.digest = nextDigest(g.digest, { kind: "add", index: g.leaves.length, commitment: c });
      g.leaves.push(h);
    }
    return next;
  },
  clear(state: PracticeState, id: number, index: number): PracticeState {
    const next = copyOf(state);
    const g = find(next, id);
    notRetired(g);
    const c = g.leaves[index];
    if (!c || BigInt(c) === 0n) refuse("UnknownLeaf");
    g.digest = nextDigest(g.digest, { kind: "clear", index, commitment: BigInt(c) });
    g.leaves[index] = toHex32(0n);
    return next;
  },
  publish(state: PracticeState, id: number, root: bigint, digest: `0x${string}`, now: number): PracticeState {
    const next = copyOf(state);
    const g = find(next, id);
    notRetired(g);
    if (root === 0n || root >= FIELD) refuse("BadRoot");
    if (digest !== g.digest) refuse("StaleList");
    g.roots.push({ seq: g.roots.length + 1, root: toHex32(root), digest, leafCount: g.leaves.length, publishedAt: now, revoked: false });
    if (g.status === STATUS.Forming) g.status = STATUS.Active;
    return next;
  },
  revoke(state: PracticeState, id: number, seq: number): PracticeState {
    const next = copyOf(state);
    const r = find(next, id).roots.find((x) => x.seq === seq);
    if (!r) return refuse("UnknownRoot");
    if (r.revoked) refuse("RootAlreadyRevoked");
    r.revoked = true;
    return next;
  },
  setStatus(state: PracticeState, id: number, to: "pause" | "resume" | "retire"): PracticeState {
    const next = copyOf(state);
    const g = find(next, id);
    if (to === "pause" && g.status !== STATUS.Active) refuse("WrongStatus");
    if (to === "resume" && g.status !== STATUS.Paused) refuse("WrongStatus");
    if (to === "retire" && g.status === STATUS.Retired) refuse("WrongStatus");
    g.status = to === "pause" ? STATUS.Paused : to === "resume" ? STATUS.Active : STATUS.Retired;
    return next;
  },
  openScope(state: PracticeState, id: number, label: string, closesAt: number, now: number): PracticeState {
    const next = copyOf(state);
    const g = find(next, id);
    notRetired(g);
    if (!printable(label, 64)) refuse("BadLabel");
    if (closesAt !== 0 && closesAt <= now) refuse("BadClosingTime");
    const scopeId = g.scopes.length + 1;
    g.scopes.push({ id: scopeId, label, status: SCOPE_OPEN, closesAt, proofs: 0, field: toHex32(practiceScope(`${id}:${scopeId}`)), nullifiers: [] });
    return next;
  },
  closeScope(state: PracticeState, id: number, scopeId: number): PracticeState {
    const next = copyOf(state);
    const s = find(next, id).scopes.find((x) => x.id === scopeId);
    if (!s) return refuse("UnknownScope");
    if (s.status !== SCOPE_OPEN) refuse("ScopeNotOpen");
    s.status = SCOPE_CLOSED;
    return next;
  },
  /** The same gates as submitProof. The caller has already run the real verifier on the proof. */
  record(state: PracticeState, id: number, scopeId: number, seq: number, nullifier: bigint, now: number): PracticeState {
    const next = copyOf(state);
    const g = find(next, id);
    if (g.status !== STATUS.Active) refuse("WrongStatus");
    const s = g.scopes.find((x) => x.id === scopeId);
    if (!s || s.status !== SCOPE_OPEN) return refuse("ScopeNotOpen");
    if (s.closesAt !== 0 && now >= s.closesAt) refuse("ScopeExpired");
    const r = g.roots.find((x) => x.seq === seq);
    if (!r) return refuse("UnknownRoot");
    if (seq + ROOT_HISTORY <= g.roots.length) refuse("RootTooOld");
    if (r.revoked) refuse("RootIsRevoked");
    const h = toHex32(nullifier);
    if (s.nullifiers.includes(h)) refuse("NullifierUsed");
    s.nullifiers.push(h);
    s.proofs += 1;
    next.proofs += 1;
    return next;
  },
  list(state: PracticeState): GroupView[] {
    return state.groups.map((g) => ({
      id: g.id,
      name: g.name,
      admin: PRACTICE_ADMIN,
      status: g.status,
      openEnrollment: g.openEnrollment,
      leafCount: g.leaves.length,
      rootCount: g.roots.length,
      scopeCount: g.scopes.length,
      digest: g.digest,
      createdAt: g.createdAt,
    }));
  },
  detail(state: PracticeState, id: number): GroupDetail | null {
    const g = state.groups.find((x) => x.id === id);
    if (!g) return null;
    const group = practice.list(state).find((x) => x.id === id) as GroupView;
    return {
      group,
      leaves: g.leaves.map((l) => BigInt(l)),
      roots: g.roots.map((r) => ({ ...r, root: BigInt(r.root) })),
      scopes: g.scopes.map((s) => ({ id: s.id, label: s.label, status: s.status, closesAt: s.closesAt, proofs: s.proofs, field: BigInt(s.field) })),
    };
  },
};

/** Roots a new proof can still use, newest first. */
export function usableRoots(d: GroupDetail): RootView[] {
  return d.roots.filter((r) => !r.revoked && r.seq + ROOT_HISTORY > d.group.rootCount).sort((a, b) => b.seq - a.seq);
}

/** Does the latest root match the list as it stands? Null when no root has been published for the current list. */
export function rootMatchesList(latest: RootView | undefined, computed: bigint, digest: `0x${string}`): "match" | "mismatch" | "older-list" | "none" {
  if (!latest) return "none";
  if (latest.digest !== digest) return "older-list";
  return latest.root === computed ? "match" : "mismatch";
}
