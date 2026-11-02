"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Reveals `[data-reveal]` blocks as they scroll into view (once). Without JS they stay visible (see .no-js). */
export function Motion() {
  const path = usePathname();
  useEffect(() => {
    document.documentElement.classList.remove("no-js");
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]:not(.seen)")];
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("seen"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("seen");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [path]);
  return null;
}
