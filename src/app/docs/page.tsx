import Link from "next/link";
import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACT_NAMES, CONTRACTS, bookLive } from "@/config/contracts";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/docs",
  title: `How ${BRAND.name} works | Docs`,
  description: `How ${BRAND.name} works: the membership circuit, commitments, roots, scopes and nullifiers, the group book contract, what is live, what is planned, and the limits of a proof.`,
});

const CONTENTS = [
  ["overview", "Overview"],
  ["limits", "What it does not do"],
  ["identity", "Identity and commitment"],
  ["groups", "Groups, roots, scopes"],
  ["circuit", "The circuit"],
  ["contracts", "The contracts"],
  ["flow", "A proof, end to end"],
  ["status", "Status"],
  ["risks", "Risks"],
  ["token", `${BRAND.symbol}`],
  ["roadmap", "Planned"],
] as const;

const STATUS = [
  ["Membership circuit (Noir, depth 16)", "Live on this site"],
  ["Browser proving in a worker", "Live on this site"],
  ["Local check with the verification key", "Live on this site"],
  ["Studio in practice mode, kept in your browser", "Live on this site"],
  ["ZekroGroupBook + verifier on chain", bookLive() ? "Live" : "Written and tested, not deployed"],
  ["Hosted proving", "Planned"],
  ["Developer API", "Planned"],
  [`${BRAND.symbol} utility`, "Planned"],
];

export default function DocsPage() {
  return (
    <section className="shell grid gap-12 pt-10 md:pt-14 lg:grid-cols-[220px_1fr] lg:gap-16">
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <p className="mono-label mb-4">Contents</p>
        <ol className="flex flex-col gap-2.5">
          {CONTENTS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-[14px] text-muted transition-colors hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </aside>
      <article className="prose-dark min-w-0">
        <p className="mono-label mb-3">Docs</p>
        <h1 className="h1 mb-8">How it works.</h1>
        <p className="lede !max-w-[46ch]">{BRAND.name} helps a person prove one requirement with cryptography, without handing over all the information behind it. The first requirement it covers: I belong to this group.</p>

        <h2 id="overview">Overview</h2>
        <p>Picture a community with a list of members who may use an app. The usual way to check is to ask a person who they are and look them up. That tells the checker who is asking, every time. With {BRAND.name}, the list holds commitments instead of names, and a member proves that one commitment is theirs without saying which.</p>
        <p>The technology is a zero-knowledge proof over a Merkle tree of commitments. {BRAND.name} is the studio around it: create a group, add commitments, publish the root, generate a proof in your browser, and let anyone check it.</p>

        <h2 id="limits">What it does not do</h2>
        <p>
          <strong>It does not make your activity anonymous.</strong> A zero-knowledge proof proves only the statement designed into the circuit. Your wallet address, IP, network metadata and transaction activity can stay visible through other layers.
        </p>
        <ul>
          <li>If you send a proof from your everyday wallet, that wallet is on the transaction, with its whole history.</li>
          <li>If you add your own commitment from that wallet, the two are linked in public. Ask a curator to add it, or use open enrollment knowing what it shows.</li>
          <li>The RPC, this site&apos;s server and your network can see your requests.</li>
          <li>In a small group, being a member may already say a lot. A proof from a list of three hides you among three.</li>
          <li>It does not say a member is trustworthy, human or unique. It says what the list&apos;s curator put on the list.</li>
          <li>A valid proof alone proves nothing about a real group: anyone can prove against a tree of their own. The verify page says &quot;checks out&quot; only for a proof tied to a root still standing in the book, and shows anything else as a warning.</li>
        </ul>
        <p>The <Link href="/review">review page</Link> shows all of this next to a real proof.</p>

        <h2 id="identity">Identity and commitment</h2>
        <p>Your browser draws two random values and keeps them: a <code>secret</code> and a <code>salt</code>. The commitment is their Poseidon hash, and it is the only thing you share to join.</p>
        <pre><code>{`commitment = Poseidon(secret, salt)
nullifier  = Poseidon(secret, scope)
signal     = keccak256(message) >> 8`}</code></pre>
        <p>The identity is kept in this browser&apos;s storage. Clear the storage or lose the device without a backup and that membership is gone: nobody can restore it. The studio shows a backup line you can copy; anyone who has that line can prove as you.</p>

        <h2 id="groups">Groups, roots, scopes</h2>
        <p>A <strong>group</strong> has one admin and a list of up to 65,536 commitments. The admin hands out two roles per group: a curator adds or clears commitments and publishes roots, a scope keeper opens and closes scopes. A group moves from Forming to Active on its first root, can be Paused and resumed, and can be Retired for good.</p>
        <p>A <strong>root</strong> is the Merkle root of the list. The contract cannot compute Poseidon, so the curator publishes the root next to the digest of the list it came from. A root for an older list is refused. Anyone can read the list from the contract, rebuild the tree and compare; the review page does this for you. The newest 32 roots stay usable so members who were mid-proof are not cut off, and the admin can revoke one.</p>
        <p>A <strong>scope</strong> is one round: a vote, a gate, a claim on a seat. Each member can prove once per scope, because one secret gives one nullifier there. The contract ties each scope to this chain, this contract, this group and this scope number, so a proof made for one is worthless in any other.</p>
        <p>Removing a member means clearing their leaf, publishing a new root and revoking the old ones. Until the old roots are revoked or age out, that member can still prove against them. That is a real limit: the admin has to act.</p>

        <h2 id="circuit">The circuit</h2>
        <p>The source is one short Noir file, <code>circuits/membership/src/main.nr</code>. Compiled size: 19,734 gates, proved with UltraHonk (Barretenberg). The whole statement:</p>
        <pre><code>{`fn main(root: pub Field, scope: pub Field, nullifier: pub Field, signal: pub Field,
        secret: Field, salt: Field, path_elements: [Field; 16], path_indices: [Field; 16]) {
    scope.assert_max_bit_size::<248>();
    signal.assert_max_bit_size::<248>();
    assert(secret != 0);
    assert(nullifier == Poseidon(secret, scope));
    assert(root_of(Poseidon(secret, salt), path_elements, path_indices) == root);
}`}</code></pre>
        <p>Four public values, and that is all a verifier learns. The setup uses the universal parameters of Barretenberg (the public Ignition ceremony), so this circuit needed no ceremony of its own. Your browser fetches the circuit, about 7 MB of WASM and 4 MB of public parameters from this site, once.</p>
        <p>Rebuild it from source and compare with <code>bash circuits/build.sh --check</code>, using nargo 1.0.0-beta.22 and bb 5.0.0-nightly.20260522.</p>

        <h2 id="contracts">The contracts</h2>
        <p>
          <strong>{CONTRACT_NAMES.book}</strong> keeps the groups: admin and roles per group, the status machine, commitments, root history, scopes and one nullifier per scope. It has no global owner, no fee and no upgrade path, and it takes no ETH.
        </p>
        <p>
          <strong>{CONTRACT_NAMES.checker}</strong> is the verifier generated from the circuit, plus its two libraries {CONTRACT_NAMES.tape} and {CONTRACT_NAMES.gates}. The runtime is 17,987 bytes, inside the 24 KB contract limit, so nothing had to be reduced. Generated verifiers put their heaviest code in those libraries, which is why there are four deployments and not two. Each part is under the limit on its own.
        </p>
        <p>Accepting one proof on a local test chain took about 2.64 million gas for the whole transaction, verifier included. On {CHAIN.name} you pay that in ETH at the current gas price; nothing else is charged.</p>
        {bookLive() ? (
          <p>
            Book: <code>{CONTRACTS.book}</code>. Verifier: <code>{CONTRACTS.checker}</code>.
          </p>
        ) : (
          <p>They are live on Robinhood Chain with verified source. The addresses are on <Link href="/stats">the stats page</Link>. <Link href="/contracts.json">contracts.json</Link> carries the ABI.</p>
        )}
        <p>Check any deployment against this source with <code>npm run verify-deployment -- &lt;address&gt; --tx &lt;creation tx&gt;</code>.</p>

        <h2 id="flow">A proof, end to end</h2>
        <ul>
          <li>A member makes an identity in the studio and sends the admin the commitment.</li>
          <li>A curator adds it, publishes the root, and a scope keeper opens a scope.</li>
          <li>The member reads the list, picks the scope, types a message and proves. The worker returns the proof and the four public values, and never the secret.</li>
          <li>The member hands out the bundle, or submits it to the contract from any wallet. Choose that wallet with care: it stays visible.</li>
          <li>Anyone checks it on <Link href="/verify">the verify page</Link>, from the bundle or the transaction hash.</li>
        </ul>

        <h2 id="status">Status</h2>
        <table className="tbl mb-6">
          <tbody>
            {STATUS.map(([a, b]) => (
              <tr key={a}>
                <td>{a}</td>
                <td className={b === "Planned" ? "text-warn" : b.startsWith("Written") ? "text-muted" : "text-good"}>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 id="risks">Risks</h2>
        <ul>
          <li>New code. The circuit and contracts have tests, listed in the repository, and no outside firm has examined them. A flaw in them could let someone prove what they should not.</li>
          <li>Generated verifier. It comes from a nightly build of the proving toolchain and could carry a flaw of its own.</li>
          <li>Group admins. An admin picks who is listed, can pause the group and can revoke roots. There is no appeal inside the contract.</li>
          <li>A dishonest root. A curator could publish a root that does not match the list. Rebuilding the tree shows this, but only if someone looks.</li>
          <li>Lost identity. There is no recovery. A leaked backup lets someone else prove as you.</li>
          <li>Slow devices. Proving runs on your machine; a low-end phone may take a long time or run out of memory.</li>
        </ul>

        <h2 id="token">{BRAND.symbol}</h2>
        <p>{BRAND.symbol} is the project&apos;s token, launching on Pons on {CHAIN.name}. It has no promised value. The circuit, prover and contracts do not read it and do not need it. See <Link href="/token">the token page</Link> for the only address.</p>

        <h2 id="roadmap">Planned</h2>
        <p>None of this is live, and we will not say it is until it is.</p>
        <ul>
          <li>Hosted proving, for devices that cannot prove on their own.</li>
          <li>A developer API for groups and proofs.</li>
          <li>{BRAND.symbol} utility inside the studio.</li>
        </ul>
      </article>
    </section>
  );
}
