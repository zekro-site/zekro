import Link from "next/link";
import { Faq } from "@/components/home/Faq";
import { HeroStatus, LiveBand } from "@/components/home/LiveBand";
import { JsonLd } from "@/components/JsonLd";
import { GlassObject } from "@/components/site/GlassObject";
import { ArrowRight } from "@/components/site/Icons";
import { ASSETS } from "@/config/assets";
import { BRAND, CHAIN } from "@/config/brand";
import { faq } from "@/content/faq";
import { appLd, faqLd } from "@/lib/seo";

const O = ASSETS.objects;

const FACTS = [
  { k: "Proving", v: "In your browser, in a worker" },
  { k: "Circuit", v: "Noir, group membership" },
  { k: "Reused proofs", v: "One nullifier per scope" },
  { k: "Network", v: `${CHAIN.name} ${CHAIN.id}` },
];

const STEPS = [
  { t: "Make an identity", b: "Your browser draws a secret and a salt and hashes them into a commitment. The secret stays on your device. The commitment is the only part you hand over." },
  { t: "Join the list", b: "A curator adds your commitment to the group, in plain view. Nothing about the list says who stands behind each entry, unless you sent yours from your own wallet." },
  { t: "Publish the root", b: "The curator publishes the Merkle root of the list and the digest it came from. Anyone can rebuild the tree from the same list and compare." },
  { t: "Prove", b: "Your browser shows you hold the private values for some leaf, ties the proof to your message and derives one nullifier for this scope. It takes seconds, on your own machine." },
  { t: "Verify", b: "Anyone runs the check: in a browser with the published key, or on chain through the verifier contract. A used nullifier is refused. The sending wallet remains public." },
];

const WHY = [
  { n: "01", t: "A checkable statement", b: "A signature says which key signed. A list check says which entry matched. A circuit lets a group ask one narrower question, whether this person belongs, and check the answer without the rest." },
  { n: "02", t: "No one to ask", b: "A gatekeeper server has to see who is asking, and you have to trust what it logs. A proof is checked with math and a public key, by anyone, with no account and no call back to us." },
  { n: "03", t: "Written limits", b: "The circuit is a short public file. What it does not state, it does not protect. That is why the wallet, the network and the timing are named on every page here, instead of hidden behind a word like private." },
];

export default function HomePage() {
  const items = faq();
  return (
    <>
      <JsonLd data={[appLd, faqLd(items)]} />
      <section className="relative overflow-hidden">
        <div className="lamp" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="shell relative grid items-center gap-10 pt-14 pb-16 md:min-h-[calc(100svh-76px)] md:grid-cols-[1.15fr_0.85fr] md:gap-6 md:pt-6 md:pb-24">
          <div className="relative z-10 flex flex-col gap-8" data-reveal="">
            <HeroStatus />
            <h1 className="h0">
              <span className="lg:whitespace-nowrap">Prove More.</span>
              <br />
              <span className="text-lift lg:whitespace-nowrap">Reveal Less.</span>
            </h1>
            <p className="lede max-w-[46ch]">
              {BRAND.name} is a zero-knowledge proof studio. {BRAND.tagline} Show that you belong to a group without saying which member you are, and let anyone check it.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/app" className="btn btn-light">
                <span>Open the studio</span>
                <ArrowRight size={15} />
              </Link>
              <Link href="/#flow" className="btn btn-ghost">
                <span>How a proof runs</span>
              </Link>
            </div>
            <p className="mono-label">secret stays in your browser · no accounts · no analytics</p>
          </div>
          <div className="relative -mx-6 md:mx-0">
            <GlassObject src={O.hero.src} alt={O.hero.alt} priority className="mx-auto w-[min(88vw,520px)] md:w-full md:max-w-[640px]" />
          </div>
        </div>
        <div className="shell relative pb-4">
          <div className="hairline-x" />
          <ul className="grid gap-x-8 gap-y-4 py-7 sm:grid-cols-2 lg:grid-cols-4" data-reveal="">
            {FACTS.map((f) => (
              <li key={f.k} className="flex flex-col gap-1">
                <span className="mono-label">{f.k}</span>
                <span className="text-[15px] text-ink2">{f.v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="shell mt-6" data-reveal="">
        <LiveBand />
      </section>

      <section className="shell mt-32">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-16" data-reveal="" id="sides">
          <div className="flex flex-col gap-4">
            <p className="mono-label">Two sides</p>
            <h2 className="h2 max-w-[20ch]">What a proof says. What it never covers.</h2>
          </div>
          <p className="lede max-w-[46ch] md:pb-1">A proof is a narrow thing, and that is the point. Read both cards before you rely on one. The limit in the second card repeats in the footer of every page, because it is the part people skip.</p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <article className="card relative overflow-hidden p-7 md:p-9" data-reveal="">
            <GlassObject src={O.gem.src} alt={O.gem.alt} width={720} height={720} sizes="360px" className="absolute -top-10 -right-12 w-[210px] opacity-90 md:w-[360px]" />
            <div className="relative flex min-h-[420px] flex-col justify-end gap-4">
              <p className="mono-label">Side 1 · the circuit</p>
              <h3 className="h2">The statement</h3>
              <p className="body max-w-[40ch]">One sentence, checked by math: I know the secret behind a commitment in this root, here is its one nullifier for this scope, and this proof is tied to this message.</p>
              <ul className="mt-2 flex flex-col gap-2 text-[14px] text-muted">
                <li>Which member you are stays out of the proof</li>
                <li>A second proof in one scope is refused</li>
                <li>Change a public value and the check fails</li>
              </ul>
            </div>
          </article>
          <article className="card relative overflow-hidden p-7 md:p-9" data-reveal="" data-testid="limit-card">
            <GlassObject src={O.eye.src} alt={O.eye.alt} width={720} height={720} sizes="360px" className="absolute -top-12 -right-10 w-[210px] opacity-90 md:w-[360px]" />
            <div className="relative flex min-h-[420px] flex-col justify-end gap-4">
              <p className="mono-label">Side 2 · everything else</p>
              <h3 className="h2">The limit</h3>
              <p className="body max-w-[40ch]">A zero-knowledge proof proves only the statement designed into the circuit. It does not make your activity anonymous. Your wallet address, IP, network metadata and transaction activity can stay visible through other layers.</p>
              <ul className="mt-2 flex flex-col gap-2 text-[14px] text-muted">
                <li>The wallet that sends a proof is public</li>
                <li>Your network can see that you visited</li>
                <li>Timing and habits can link actions over time</li>
              </ul>
            </div>
          </article>
        </div>
      </section>

      <section className="shell mt-32">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-16" data-reveal="" id="flow">
          <div className="flex flex-col gap-4">
            <p className="mono-label">How a proof runs</p>
            <h2 className="h2 max-w-[20ch]">Five steps. One of them leaves your device as a proof.</h2>
          </div>
          <p className="lede max-w-[46ch] md:pb-1">Groups live in a public book on {CHAIN.name}. Your secret never joins them. Only the commitment and, later, the proof and its public values do.</p>
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="order-2 lg:order-1">
            <GlassObject src={O.steps.src} alt={O.steps.alt} width={800} height={800} sizes="440px" className="mx-auto w-[min(70vw,380px)] lg:sticky lg:top-32 lg:w-full lg:max-w-[440px]" />
          </div>
          <ol className="order-1 flex flex-col lg:order-2">
            {STEPS.map((s, i) => (
              <li key={s.t} className="grid gap-4 border-t border-line py-7 sm:grid-cols-[72px_1fr] sm:gap-8" data-reveal="" style={{ transitionDelay: `${i * 60}ms` }}>
                <span className="mono text-[13px] text-lift">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex flex-col gap-2">
                  <h3 className="h3">{s.t}</h3>
                  <p className="body max-w-[52ch]">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell mt-32">
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:gap-16" data-reveal="" id="circuit">
          <div className="flex flex-col gap-4">
            <p className="mono-label">Why a circuit</p>
            <h2 className="h2 max-w-[14ch]">A question you can check without asking us.</h2>
          </div>
          <p className="lede max-w-[46ch] md:pb-1">Membership checks usually mean showing a server who you are. A circuit moves the check to math that anyone can run, which also makes its limits easy to read.</p>
          <GlassObject src={O.links.src} alt={O.links.alt} width={620} height={620} sizes="300px" className="absolute -top-14 right-[-32px] hidden w-[280px] xl:block" />
        </div>
        <div className="relative mt-12 grid gap-5 lg:grid-cols-3">
          {WHY.map((w) => (
            <article key={w.n} className="card flex flex-col gap-4 p-7" data-reveal="">
              <span className="mono text-[13px] text-lift">{w.n}</span>
              <h3 className="h3">{w.t}</h3>
              <p className="body">{w.b}</p>
            </article>
          ))}
        </div>
        <div className="card relative mt-5 flex flex-col gap-3 p-7 md:flex-row md:items-center md:justify-between" data-reveal="">
          <div className="flex flex-col gap-2">
            <p className="mono-label">For developers</p>
            <h3 className="h3">{BRAND.name} is an open circuit, a verifier and a group book.</h3>
            <p className="body max-w-[60ch]">
              Read the Noir source, rebuild the verifier, and call <code className="mono text-[14px] text-ink">verify</code> or <code className="mono text-[14px] text-ink">submitProof</code> from your own contract. Hosted proving and an API are planned, not live.
            </p>
          </div>
          <Link href="/docs#circuit" className="btn btn-ghost shrink-0 self-start md:self-auto">
            <span>Read the circuit</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <section className="shell mt-32">
        <div className="flex flex-col gap-4" data-reveal="">
          <p className="mono-label">Questions</p>
          <h2 className="h2 max-w-[20ch]">The ones to ask before you rely on it.</h2>
        </div>
        <Faq items={items} />
      </section>

      <section className="shell mt-32" data-reveal="">
        <div className="card relative overflow-hidden px-7 py-14 text-center md:px-12 md:py-20">
          <div className="lamp" aria-hidden="true" style={{ background: "radial-gradient(50% 60% at 50% 100%, rgba(47,123,214,.3) 0, rgba(47,123,214,.06) 50%, rgba(47,123,214,0) 75%)" }} />
          <GlassObject src={O.key.src} alt={O.key.alt} width={520} height={520} sizes="260px" className="absolute top-1/2 -left-10 hidden w-[260px] -translate-y-1/2 lg:block" />
          <div className="relative flex flex-col items-center gap-6">
            <p className="mono-label">The studio is open</p>
            <h2 className="h1 max-w-[18ch]">Make a real proof in the next minute.</h2>
            <p className="lede max-w-[46ch]">No wallet needed to try it. A real circuit, a proof your own device computes, and a check that spells out what it covers and what it leaves out.</p>
            <Link href="/prove" className="btn btn-light mt-2">
              <span>Make a proof</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
