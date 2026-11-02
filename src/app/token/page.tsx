import { CaBlock } from "@/components/site/CaCopy";
import { ArrowUpRight } from "@/components/site/Icons";
import { PageHero } from "@/components/site/PageHero";
import { TokenFacts } from "@/components/token/TokenFacts";
import { BRAND, CHAIN, LAUNCHPAD, TOKEN, buyUrl } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.name} (${BRAND.symbol}) Token`,
  description: `${BRAND.symbol} on ${CHAIN.name}: the only contract address, live supply, and the planned uses. The ${BRAND.name} studio works without the token.`,
});

const PLANNED = ["Hosted proving for phones and low-end devices", "A developer API for groups and proofs", "Studio features paid for in " + BRAND.symbol];

export default function TokenPage() {
  return (
    <PageHero label="Token" title={`${BRAND.symbol}, plainly.`} lede={`The token of the ${BRAND.name} project on ${CHAIN.name}. It has no promised value and the studio does not need it. Everything it might do later is marked as planned below.`}>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.22fr]">
        <div className="card flex min-w-0 flex-col gap-5 p-6 md:p-7">
          <CaBlock testid="token-ca" />
          <p className="body">{TOKEN.isLive ? `This is the only address. If another one claims to be ${BRAND.symbol}, it is not ours. Check it here before you buy anything.` : `${BRAND.symbol} has not launched. No address exists yet, so any address you are shown today is not ours. The real one appears here and on X at launch.`}</p>
          <a href={buyUrl()} target="_blank" rel="noreferrer noopener" className="btn btn-light w-full justify-center" data-testid="token-buy">
            <span>{TOKEN.isLive ? `Open on ${LAUNCHPAD.name}` : `${LAUNCHPAD.name}, at launch`}</span>
            <ArrowUpRight size={15} />
          </a>
          <p className="text-[13px] leading-[1.5] text-muted">Not financial advice. Buy only what you are fine to lose, and do your own research first.</p>
        </div>
        <div className="card flex min-w-0 flex-col gap-6 p-6 md:p-7">
          <TokenFacts />
          <div>
            <span className="pill pill-warn mb-4">Planned, not live</span>
            <ul className="flex flex-col gap-2 text-[15px] text-ink2">
              {PLANNED.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PageHero>
  );
}
