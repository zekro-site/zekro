/*
 * What a proof check may claim. A proof can be valid mathematically and still say nothing about any real group: anyone can
 * build a tree of their own and prove against it. So "checks out" is reserved for a proof bound to a root and scope in the book,
 * with that root still standing. Every headline on the verify page comes from here, so it can be tested without a browser.
 */

export type Verdict =
  /** Valid, bound to the book, and the root still stands. The only state allowed to say "checks out". */
  | "current"
  /** Valid and bound, but the root was revoked or has aged out: it does not show membership today. */
  | "historic"
  /** Valid maths against a root nothing ties to a group. */
  | "unbound"
  /** Some check failed. */
  | "invalid";

export type Judged = { verdict: Verdict; title: string; reasons: string[] };

export const VERDICT_TITLES: Record<Verdict, string> = {
  current: "This proof checks out.",
  historic: "Valid when made, not current membership.",
  unbound: "Valid maths, not tied to any group.",
  invalid: "This proof does not check out.",
};

const done = (verdict: Verdict, reasons: string[]): Judged => ({ verdict, title: VERDICT_TITLES[verdict], reasons });

export type BundleFacts = {
  proofValid: boolean;
  signalMatches: boolean;
  /** The verifier contract's answer: null when it was not asked or could not be reached. */
  chainValid: boolean | null;
  /** Null when the bundle names no group in this site's book. Its fields are checked, never taken from the bundle. */
  bound: { rootMatches: boolean; scopeMatches: boolean; revoked: boolean; tooOld: boolean } | null;
  /** Set when the bundle names a contract other than this site's book. */
  otherContract?: boolean;
};

export function judgeBundle(f: BundleFacts): Judged {
  const bad: string[] = [];
  if (!f.proofValid) bad.push("The proof fails against its public values.");
  if (!f.signalMatches) bad.push("The message does not match the signal.");
  if (f.chainValid === false) bad.push("The verifier contract rejected it.");
  if (f.otherContract) bad.push("It names a different contract, which this site cannot vouch for.");
  if (f.bound && !f.bound.rootMatches) bad.push("Its root is not that root of the group.");
  if (f.bound && !f.bound.scopeMatches) bad.push("Its scope is not that scope of the group.");
  if (bad.length) return done("invalid", bad);
  if (!f.bound) return done("unbound", ["Anyone can build a tree of their own and prove against it. Compare this root with one you trust before it means anything."]);
  if (f.bound.revoked) return done("historic", ["The group's admin has revoked this root."]);
  if (f.bound.tooOld) return done("historic", ["This root is more than 32 roots old, so the book would no longer accept it."]);
  return done("current", []);
}

export type TxFacts = {
  proofValid: boolean;
  /** "0x1" when mined and successful, anything else when not. */
  receiptStatus: string | null;
  scopeMatches: boolean;
  chainValid: boolean | null;
  revoked: boolean;
  tooOld: boolean;
  /** Null when the transaction carries no note. */
  noteMatches: boolean | null;
};

export function judgeTx(f: TxFacts): Judged {
  const bad: string[] = [];
  if (!f.proofValid) bad.push("The proof fails against the values in the book.");
  if (f.receiptStatus === null) bad.push("The transaction has not been mined.");
  else if (f.receiptStatus !== "0x1") bad.push("The transaction reverted, so the book did not accept it.");
  if (!f.scopeMatches) bad.push("The scope does not match the contract's formula.");
  if (f.chainValid === false) bad.push("The verifier contract rejected it.");
  if (f.noteMatches === false) bad.push("The text sent with it does not match the signal the proof is tied to.");
  if (bad.length) return done("invalid", bad);
  if (f.revoked) return done("historic", ["Accepted when sent. The group's admin has since revoked this root."]);
  if (f.tooOld) return done("historic", ["Accepted when sent. This root has since aged out of the newest 32."]);
  return done("current", []);
}

/** The root may be used for new proofs only while it is among the newest 32 (ZekroGroupBook.ROOT_HISTORY). */
export const rootAgedOut = (seq: number, rootCount: number, history = 32) => seq + history <= rootCount;
