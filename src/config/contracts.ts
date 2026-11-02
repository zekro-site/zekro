import { isAddress } from "@/config/brand";

/*
 * Zekro contract addresses on Robinhood Chain.
 *   tape, gates  the verifier's two libraries (ZekroFiatShamirTape, ZekroGateRelations), no arguments
 *   checker      ZekroMemberCheck, the UltraHonk verifier generated from circuits/membership, links both libraries
 *   book         ZekroGroupBook, constructor (checker), no owner
 * Empty => the studio runs in practice mode: the proofs are real, the book is kept in this browser and nothing is sent.
 * Check a deployment any time: `npm run verify-deployment -- <book address> --tx <creation tx>`.
 */
const DEPLOYED = {
  tape: "0xf0c55c1ebc96ca21fe949078e8b76f153522fc7d",
  gates: "0xd5347e614f9f95b38653d235d6baf59676147598",
  checker: "0xd1cb32482ff03b79251e4fc4b7eedc493555dd3e",
  book: "0x3efe3bf22abfead607c75fba4b3086026fc66dae",
  /** Block of the book's deployment (first block worth reading its events from). */
  bookBlock: 103905318,
};

/**
 * Local tests only: NEXT_PUBLIC_ZEKRO_TEST_CONTRACTS='{"book":"0x…","checker":"0x…","bookBlock":1}' at build time points
 * a second build at contracts deployed on an anvil chain. Never set it on Vercel.
 */
function testOverride(): typeof DEPLOYED | null {
  const raw = process.env.NEXT_PUBLIC_ZEKRO_TEST_CONTRACTS;
  if (!raw) return null;
  try {
    const v = { ...DEPLOYED, ...(JSON.parse(raw) as Partial<typeof DEPLOYED>) };
    return isAddress(v.book) ? v : null;
  } catch {
    return null;
  }
}

export const CONTRACTS = testOverride() ?? DEPLOYED;

export const bookLive = () => isAddress(CONTRACTS.book);

export const CONTRACT_NAMES = { book: "ZekroGroupBook", checker: "ZekroMemberCheck", tape: "ZekroFiatShamirTape", gates: "ZekroGateRelations" } as const;
