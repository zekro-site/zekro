import { BRAND, CHAIN, LAUNCHPAD, TOKEN } from "@/config/brand";
import { bookLive } from "@/config/contracts";

/** Questions on the home page; the same text feeds the FAQPage JSON-LD. */
export const faq = (): { q: string; a: string }[] => [
  {
    q: `What is ${BRAND.name}?`,
    a: `${BRAND.name} is a zero-knowledge proof studio on ${CHAIN.name}. A community keeps a list of members as commitments, publishes the Merkle root of that list, and a member proves in the browser that one of those commitments is theirs, without saying which one. Anyone can check the proof.`,
  },
  {
    q: `Does a ${BRAND.name} proof make me anonymous?`,
    a: `No. A zero-knowledge proof proves only the statement written into the circuit. Your wallet address, IP address, network metadata and transaction activity can stay visible through other layers. If you submit a proof from your everyday wallet, that wallet is on the transaction for everyone to read. The proof hides which member of the list you are, and that is all it hides.`,
  },
  {
    q: "What ends up public on chain?",
    a: "When a group is built: the admin's wallet, every commitment, and every root. When a proof is submitted: the sending wallet, the root it used, the scope, the nullifier, the signal, and the time. It does not see the secret, the salt or which leaf the proof belongs to. The review page lays out every value for a proof you paste in.",
  },
  {
    q: "What stops one member from proving twice?",
    a: "The nullifier. It is derived from the member's secret and the scope, so one identity produces one value per scope. The contract records it and refuses a second proof with the same value. In a different scope the value is different and cannot be linked to the first by the math alone.",
  },
  {
    q: "What can go wrong?",
    a: "Lose your identity backup and that membership is gone; nobody can restore it. A group admin decides who gets on the list and can pause the group, so a group is only as fair as its admin. A root is published by a curator, and the contract cannot recompute it; the review page rebuilds it from the list so you can compare. The circuit and contracts are new code and no outside firm has examined them. Use them for what you can afford to have go wrong.",
  },
  {
    q: "Are the contracts live?",
    a: bookLive()
      ? `Yes. The group book and its verifier are live on ${CHAIN.name}. The stats page reads them directly. The circuit, the prover and the checks in your browser are the ones this site serves.`
      : `The circuit, the browser prover and the checks are live on this site right now. The contracts are written and tested but not deployed yet, so the studio runs in practice mode: real proofs, with the group book kept in your own browser and nothing sent.`,
  },
  {
    q: `How do I get ${BRAND.symbol}?`,
    a: TOKEN.isLive
      ? `${BRAND.symbol} trades on ${LAUNCHPAD.name} on ${CHAIN.name}. The only address is on the token page. Check it before you buy anything. It has no promised value, and the studio works without it.`
      : `${BRAND.symbol} has not launched. When it does, it launches on ${LAUNCHPAD.name} on ${CHAIN.name} and the only address is on the token page. The studio works without it. Any use for the token is planned, not live.`,
  },
];
