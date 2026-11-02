"use client";

import Link from "next/link";
import { useState } from "react";
import { BRAND, TOKEN, explorerToken, isAddress, shortAddress } from "@/config/brand";
import { CheckIcon, CopyIcon } from "@/components/site/Icons";

/* Copy CA: one component family, one source (BRAND.ca). Before launch it says "At launch" and copies nothing. */

export function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused; the text stays visible.
    }
  };
  return { copied, copy };
}

/** Navbar chip: "$ZEKRO 0x12…abcd" copies once the CA is real; before that it opens the token page. */
export function CaPill({ short = false }: { short?: boolean }) {
  const { copied, copy } = useCopy(BRAND.ca);
  if (!TOKEN.isLive)
    return (
      <Link href="/token" className="ca-chip" data-testid="ca-pill" title="The contract address is published at launch">
        {short ? "CA" : <>{BRAND.symbol} <span className="opacity-70">· at launch</span></>}
      </Link>
    );
  return (
    <button type="button" className="ca-chip" onClick={copy} data-testid="ca-pill" title={`Copy the ${BRAND.symbol} contract address`}>
      {short ? "CA" : <>{BRAND.symbol} <span className="opacity-80">{shortAddress(BRAND.ca, 4, 4)}</span></>}
      {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
    </button>
  );
}

/** Label, full address, copy: footer and token page. */
export function CaBlock({ testid = "ca-block" }: { testid?: string }) {
  const { copied, copy } = useCopy(BRAND.ca);
  const live = TOKEN.isLive;
  return (
    <span className="flex flex-col gap-1" data-testid={testid}>
      <span className="mono-label">{BRAND.symbol} contract</span>
      <span className="flex flex-wrap items-center gap-2">
        {live ? (
          <a href={explorerToken(BRAND.ca)} target="_blank" rel="noreferrer noopener" className="mono break-all text-[13px] text-ink2 transition-colors hover:text-lift">
            {BRAND.ca}
          </a>
        ) : (
          <span className="mono text-[13px] text-ink2">Published at launch</span>
        )}
        <button type="button" onClick={copy} disabled={!live} data-testid={`${testid}-copy`} className="pill cursor-pointer !py-1 disabled:cursor-not-allowed disabled:opacity-60" title={live ? "Copy the contract address" : "Published at launch"}>
          {live ? (copied ? "Copied" : "Copy") : "At launch"}
        </button>
      </span>
    </span>
  );
}

/** An address or a hash, shortened, click to copy. */
export function CopyValue({ value, head = 10, tail = 8 }: { value: string; head?: number; tail?: number }) {
  const { copied, copy } = useCopy(value);
  const looksLong = value.length > head + tail + 2;
  return (
    <button type="button" onClick={copy} title={copied ? "Copied" : `Copy ${value}`} className="mono inline-flex max-w-full items-center gap-1.5 text-left text-[13px] text-ink2 transition-colors hover:text-lift">
      <span className="truncate">{looksLong ? `${value.slice(0, head)}…${value.slice(-tail)}` : value}</span>
      {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
    </button>
  );
}

export const shownAddress = (v: string) => (isAddress(v) ? shortAddress(v, 8, 6) : "—");
