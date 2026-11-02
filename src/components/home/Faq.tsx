/** Native details: works without JS, and the text is in the HTML for search and for readers. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="mt-10 border-t border-line" data-reveal="">
      {items.map((i) => (
        <details key={i.q} className="group border-b border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] text-ink transition-colors hover:text-lift [&::-webkit-details-marker]:hidden">
            {i.q}
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-2 text-muted transition-transform group-open:rotate-45">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M6 1v10M1 6h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </summary>
          <p className="body max-w-[64ch] pb-6">{i.a}</p>
        </details>
      ))}
    </div>
  );
}
