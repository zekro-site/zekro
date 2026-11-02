// Test helper called by forge (vm.ffi): proves with the same TypeScript code the site uses and prints the
// ABI-encoded result.
//   node prove.mts prove '{"secret":"0x..","salt":"0x..","scope":"0x..","signal":"0x..","leaves":["0x..",..]}'
//     -> abi.encode(bytes proof, uint256 root, uint256 nullifier)
import { closeProver, proveNode } from "../../../src/lib/zk/prover-node.ts";

// bb.js reports progress on stdout; keep stdout for the ABI result only.
console.log = (...a: unknown[]) => console.error(...a);

const w = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
const [cmd, arg] = process.argv.slice(2);
if (cmd === "prove") {
  const j = JSON.parse(arg);
  const r = await proveNode({ secret: BigInt(j.secret), salt: BigInt(j.salt) }, (j.leaves as string[]).map(BigInt), BigInt(j.scope), BigInt(j.signal));
  const proof = r.proof.slice(2);
  const tail = w(proof.length / 2) + proof.padEnd(Math.ceil(proof.length / 64) * 64, "0");
  process.stdout.write("0x" + w(3 * 32) + w(r.values.root) + w(r.values.nullifier) + tail);
  await closeProver();
} else if (cmd === "commit") {
  const { hash2 } = await import("../../../src/lib/zk/core.ts");
  const j = JSON.parse(arg);
  process.stdout.write("0x" + w(hash2(BigInt(j.a), BigInt(j.b))));
} else {
  console.error("unknown command");
  process.exit(1);
}
