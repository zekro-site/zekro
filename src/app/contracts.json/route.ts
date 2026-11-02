import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, bookLive } from "@/config/contracts";
import { BOOK_ABI, CHECKER_ABI } from "@/lib/abi";

export const dynamic = "force-static";

/** Machine-readable pointer to the contracts: chain, addresses (null until deployed) and the ABIs. */
export function GET() {
  const live = bookLive();
  const body = {
    name: BRAND.name,
    chain: { name: CHAIN.name, id: CHAIN.id, rpc: CHAIN.publicRpc, explorer: CHAIN.explorer },
    contracts: {
      ZekroGroupBook: { address: live ? CONTRACTS.book : null, deployedBlock: live ? CONTRACTS.bookBlock : null, status: live ? "deployed" : "not deployed yet", abi: BOOK_ABI },
      ZekroMemberCheck: { address: live ? CONTRACTS.checker : null, status: live ? "deployed" : "not deployed yet", abi: CHECKER_ABI },
    },
    circuit: { name: "membership", prover: "UltraHonk, EVM target", publicInputs: ["root", "scope", "nullifier", "signal"], artifact: "/zk/membership.json" },
    notes: "No global owner, no fees, never holds funds. A proof covers only the circuit's statement; the sending wallet stays visible.",
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
}
