import { encodeFunctionData, type Abi } from "viem";
import { CONTRACTS } from "@/config/contracts";
import { BOOK_ABI, CHECKER_ABI, REFUSALS } from "@/lib/abi";
import { ChainError, read, readMany, rpcCall } from "@/lib/client";
import type { GroupDetail, GroupView, RootView, ScopeView } from "@/lib/book";
import { publicInputsOf, type PublicValues } from "@/lib/zk/core";

/* Reads of ZekroGroupBook, from state only (names, leaves, roots and scopes all have getters), and call data for its writes. */

const book = () => CONTRACTS.book;
const abi = BOOK_ABI as Abi;
const r = (fn: string, args: readonly unknown[] = []) => ({ to: book(), abi, fn, args });

type RawGroup = { admin: string; status: number; openEnrollment: boolean; leafCount: number; rootCount: number; scopeCount: number; pendingAdmin: string; createdAt: bigint; leavesDigest: `0x${string}` };
type RawRoot = { root: bigint; leavesDigest: `0x${string}`; leafCount: number; publishedAt: bigint; revoked: boolean };
type RawScope = { status: number; closesAt: bigint; proofs: number; field: bigint };

const view = (id: number, name: string, g: RawGroup): GroupView => ({
  id,
  name,
  admin: g.admin,
  status: Number(g.status),
  openEnrollment: g.openEnrollment,
  leafCount: Number(g.leafCount),
  rootCount: Number(g.rootCount),
  scopeCount: Number(g.scopeCount),
  digest: g.leavesDigest,
  createdAt: Number(g.createdAt),
});

/** The newest groups, newest first. */
export async function listGroups(max = 40): Promise<GroupView[]> {
  const count = Number(await read<bigint>(r("groupCount")));
  const ids: number[] = [];
  for (let id = count; id > 0 && ids.length < max; id--) ids.push(id);
  const raw = await readMany(ids.flatMap((id) => [r("groupOf", [BigInt(id)]), r("nameOf", [BigInt(id)])]));
  const out: GroupView[] = [];
  ids.forEach((id, i) => {
    const g = raw[i * 2] as RawGroup | null;
    if (g) out.push(view(id, (raw[i * 2 + 1] as string | null) ?? "", g));
  });
  return out;
}

const PAGE = 256;

/** Everything about one group: the whole list (a page at a time), its last 40 roots, its last 40 scopes. */
export async function loadGroup(id: number): Promise<GroupDetail | null> {
  const big = BigInt(id);
  const [rawGroup, rawName] = await readMany([r("groupOf", [big]), r("nameOf", [big])]);
  const g = rawGroup as RawGroup | null;
  if (!g || /^0x0+$/.test(g.admin)) return null;
  const group = view(id, (rawName as string | null) ?? "", g);
  const pages: bigint[][] = [];
  for (let start = 0; start < group.leafCount; start += PAGE) {
    pages.push((await read<readonly bigint[]>(r("leavesPage", [big, BigInt(start), BigInt(PAGE)]))) as bigint[]);
  }
  const seqs: number[] = [];
  for (let s = group.rootCount; s > 0 && seqs.length < 40; s--) seqs.push(s);
  const scopeIds: number[] = [];
  for (let s = group.scopeCount; s > 0 && scopeIds.length < 40; s--) scopeIds.push(s);
  const [rootsRaw, scopesRaw] = await Promise.all([
    readMany(seqs.map((s) => r("rootOf", [big, BigInt(s)]))),
    readMany(scopeIds.flatMap((s) => [r("scopeOf", [big, BigInt(s)]), r("labelOf", [big, BigInt(s)])])),
  ]);
  const roots: RootView[] = [];
  seqs.forEach((seq, i) => {
    const x = rootsRaw[i] as RawRoot | null;
    if (x) roots.push({ seq, root: x.root, digest: x.leavesDigest, leafCount: Number(x.leafCount), publishedAt: Number(x.publishedAt), revoked: x.revoked });
  });
  const scopes: ScopeView[] = [];
  scopeIds.forEach((sid, i) => {
    const x = scopesRaw[i * 2] as RawScope | null;
    if (x) scopes.push({ id: sid, label: (scopesRaw[i * 2 + 1] as string | null) ?? "", status: Number(x.status), closesAt: Number(x.closesAt), proofs: Number(x.proofs), field: x.field });
  });
  return { group, leaves: pages.flat(), roots: roots.sort((a, b) => a.seq - b.seq), scopes: scopes.sort((a, b) => a.id - b.id) };
}

export const rolesOf = (id: number, account: string) => read<number>(r("rolesOf", [BigInt(id), account]));

export const isNullifierUsed = (id: number, scopeId: number, nullifier: bigint) => read<boolean>(r("isNullifierUsed", [BigInt(id), BigInt(scopeId), nullifier]));

export const rootCountOf = async (id: number) => Number((await read<RawGroup>(r("groupOf", [BigInt(id)]))).rootCount);
export const rootEntry = (id: number, seq: number) => read<RawRoot>(r("rootOf", [BigInt(id), BigInt(seq)]));
export const scopeEntry = (id: number, scopeId: number) => read<RawScope>(r("scopeOf", [BigInt(id), BigInt(scopeId)]));

/** The contract's own answer for a proof, without sending anything. */
export async function precheck(id: number, scopeId: number, seq: number, nullifier: bigint, signal: bigint, proof: `0x${string}`) {
  const code = await read<number>(r("precheck", [BigInt(id), BigInt(scopeId), BigInt(seq), nullifier, signal, proof]));
  return REFUSALS[Number(code)] ?? "ProofRejected";
}

/** eth_call of the verifier contract with the proof's public inputs. A revert means "not valid"; a read that failed means unknown (null). */
export async function checkOnChain(proof: `0x${string}`, values: PublicValues): Promise<boolean | null> {
  try {
    const data = encodeFunctionData({ abi: CHECKER_ABI, functionName: "verify", args: [proof, publicInputsOf(values) as `0x${string}`[]] });
    const out = await rpcCall<string>("eth_call", [{ to: CONTRACTS.checker, data }, "latest"]);
    return BigInt(out) === 1n;
  } catch (e) {
    return e instanceof ChainError && e.final ? false : null;
  }
}

/** Call data for one book write. */
export const write = (functionName: string, args: readonly unknown[]) => encodeFunctionData({ abi, functionName, args } as never);
