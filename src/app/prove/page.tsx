import { ProveLab } from "@/components/prove/ProveLab";
import { PageHero } from "@/components/site/PageHero";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/prove",
  title: `Try a zero-knowledge proof | ${BRAND.name}`,
  description: `Make a real zero-knowledge membership proof in your browser with ${BRAND.name}. No wallet, nothing sent. See what the proof reveals, and what it leaves out.`,
});

export default function ProvePage() {
  return (
    <PageHero
      label="Prove"
      title={
        <>
          Prove membership
          <br className="hidden lg:block" /> right now, on this page.
        </>
      }
      lede="No wallet, no group, no upload. A real circuit runs on your device over a made-up list, so the difference between what is proved and what stays private is there to read."
    >
      <ProveLab />
    </PageHero>
  );
}
