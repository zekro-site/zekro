import { BRAND, CHAIN } from "@/config/brand";

export const dynamic = "force-static";

export function GET() {
  const text = `# ${BRAND.name}

> ${BRAND.slogan} ${BRAND.tagline}

${BRAND.description}

- Chain: ${CHAIN.name} (${CHAIN.id})
- Circuit: Noir group membership, UltraHonk proof, browser proving
- Limit: a proof covers only the circuit's statement. Wallet address, IP, network metadata and transaction activity can stay visible. It is not anonymity.
- Planned, not live: hosted proving, developer API, ${BRAND.symbol} utility

## Pages
- ${BRAND.url}/prove: make a proof in your tab
- ${BRAND.url}/verify: check a proof
- ${BRAND.url}/review: what a proof reveals
- ${BRAND.url}/stats: live group book
- ${BRAND.url}/docs: how it works
- ${BRAND.url}/token: ${BRAND.symbol}
- ${BRAND.url}/contracts.json: addresses and ABI
`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
