import Link from "next/link";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";
import { CaBlock } from "@/components/site/CaCopy";
import { Wordmark } from "@/components/site/Brand";
import { GitHubLogo, XLogo } from "@/components/site/Icons";
import { NAV } from "@/components/site/nav";

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-line">
      <div className="shell grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr] md:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <Wordmark size={24} />
          <p className="small max-w-[38ch]">{BRAND.slogan} {BRAND.tagline} A proof covers only what the circuit states; wallet, IP and transactions can stay visible.</p>
          <p className="mono-label">
            chain {CHAIN.id}
          </p>
          <CaBlock testid="footer-ca" />
        </div>
        <div>
          <p className="mono-label mb-4">Site</p>
          <ul className="flex flex-col gap-3">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-[14px] text-ink2 transition-colors hover:text-ink">
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/token" className="text-[14px] text-ink2 transition-colors hover:text-ink">
                {BRAND.symbol} token
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mono-label mb-4">Elsewhere</p>
          <ul className="flex flex-col gap-3">
            <li>
              <a href={BRAND.x} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 text-[14px] text-ink2 transition-colors hover:text-ink">
                <XLogo size={13} /> {BRAND.xHandle}
              </a>
            </li>
            {hasGithub ? (
              <li>
                <a href={BRAND.github} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 text-[14px] text-ink2 transition-colors hover:text-ink">
                  <GitHubLogo size={13} /> Source code
                </a>
              </li>
            ) : null}
            <li>
              <a href={CHAIN.explorer} target="_blank" rel="noreferrer noopener" className="text-[14px] text-ink2 transition-colors hover:text-ink">
                {CHAIN.name} explorer
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="shell flex flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-faint">© 2026 {BRAND.name}. Not affiliated with Robinhood. Not financial advice.</p>
          <p className="mono text-[12px] text-faint">no trackers · no sign-up</p>
        </div>
      </div>
    </footer>
  );
}
