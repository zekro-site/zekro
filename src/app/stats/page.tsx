import { PageHero } from "@/components/site/PageHero";
import { StatsBoard } from "@/components/stats/StatsBoard";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/stats",
  title: `Live group book stats | ${BRAND.name}`,
  description: `${BRAND.name} stats: groups, commitments and accepted proofs, read live from the ${BRAND.chainName} group book by your browser, with no database in between.`,
});

export default function StatsPage() {
  return (
    <PageHero
      label="Stats"
      title={
        <>
          The group book,
          <br className="hidden lg:block" /> read as it stands.
        </>
      }
      lede={`Groups, commitments, proofs and the chain under them. All of it comes straight from ${BRAND.chainName}, and what does not exist yet reads as a dash.`}
    >
      <StatsBoard />
    </PageHero>
  );
}
