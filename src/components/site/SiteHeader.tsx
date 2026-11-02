"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "@/config/brand";
import { CaPill } from "@/components/site/CaCopy";
import { Wordmark } from "@/components/site/Brand";
import { ArrowRight, MenuIcon, XLogo } from "@/components/site/Icons";
import { NAV } from "@/components/site/nav";
import { NavWallet } from "@/components/wallet/WalletButton";

export function SiteHeader() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const [routed, setRouted] = useState(path);
  if (routed !== path) {
    setRouted(path);
    setOpen(false);
  }
  return (
    <header className="sticky top-0 z-50">
      <div className={`border-b transition-colors duration-300 ${scrolled || open ? "border-line bg-ground/80 backdrop-blur-xl" : "border-transparent"}`}>
        <div className="shell flex h-[76px] items-center gap-3 xl:gap-5">
          <Link href="/" className="flex items-center" aria-label={`${BRAND.name} home`}>
            <Wordmark />
          </Link>
          <nav className="ml-auto hidden items-center gap-5 xl:flex" aria-label="Primary">
            {NAV.map((n) => {
              const active = path === n.href;
              return (
                <Link key={n.href} href={n.href} className={`inline-flex items-center gap-1.5 text-[14px] transition-colors hover:text-ink ${active ? "font-semibold text-ink" : "text-muted"}`}>
                  {n.label}
                  {active ? <span className="dot" aria-hidden="true" /> : null}
                </Link>
              );
            })}
          </nav>
          <a href={BRAND.x} target="_blank" rel="noreferrer noopener" aria-label={`${BRAND.name} on X, ${BRAND.xHandle}`} className="hidden h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink xl:flex">
            <XLogo size={16} />
          </a>
          <div className="ml-auto flex min-w-0 items-center gap-2 xl:ml-0">
            <div className="hidden sm:block">
              <CaPill />
            </div>
            <div className="sm:hidden">
              <CaPill short />
            </div>
            <NavWallet />
          </div>
          <button type="button" aria-expanded={open} aria-controls="menu" onClick={() => setOpen((v) => !v)} className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line-2 xl:hidden" data-testid="menu-button">
            <span className="sr-only">Menu</span>
            <MenuIcon size={18} />
          </button>
        </div>
        <div id="menu" hidden={!open} className="max-h-[calc(100dvh-76px)] overflow-y-auto border-t border-line bg-ground xl:hidden">
          <nav className="shell flex flex-col py-2" aria-label="Primary, mobile">
            {[...NAV, { href: "/token", label: `${BRAND.symbol} token` }].map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex min-h-[52px] items-center justify-between border-b border-line text-[16px] text-ink2 last:border-0">
                {n.label}
                <ArrowRight size={16} className="text-faint" />
              </Link>
            ))}
            <a href={BRAND.x} target="_blank" rel="noreferrer noopener" className="flex min-h-[52px] items-center justify-between text-[16px] text-ink2">
              X
              <ArrowRight size={16} className="text-faint" />
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
