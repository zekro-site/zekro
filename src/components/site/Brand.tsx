import { ASSETS } from "@/config/assets";
import { BRAND } from "@/config/brand";

/** Mark + word. `.webp` mark at small size, plain <img> (small icons do not go through next/image). */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-ink">
      <img src={ASSETS.mark} alt="" width={size} height={size} draggable={false} style={{ display: "block", width: size, height: size }} />
      <span className="font-semibold" style={{ fontSize: 16, letterSpacing: "0.06em" }}>
        {BRAND.name.toUpperCase()}
      </span>
    </span>
  );
}
