import { Studio } from "@/components/studio/Studio";
import { PageHero } from "@/components/site/PageHero";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/app",
  title: `Studio | ${BRAND.name}`,
  description: `The ${BRAND.name} studio: create a group, add commitments, publish the root, and prove membership in your browser.`,
  noindex: true,
});

export default function StudioPage() {
  return (
    <PageHero
      label="Studio"
      title={
        <>
          Group. Root.
          <br className="hidden lg:block" /> Proof. Check.
        </>
      }
      lede="Build a group, publish its root and prove you belong, in that order. The identity stays in this browser, the proof is made in this tab, and the wallet only signs what goes on chain."
    >
      <Studio />
    </PageHero>
  );
}
