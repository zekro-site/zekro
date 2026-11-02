import { ReviewDesk } from "@/components/review/ReviewDesk";
import { PageHero } from "@/components/site/PageHero";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/review",
  title: `What a proof reveals | ${BRAND.name}`,
  description: `${BRAND.name} review: every public value of a membership proof, what each one tells a verifier, what it leaves out, and what can stay visible anyway.`,
});

export default function ReviewPage() {
  return (
    <PageHero
      label="Review"
      title={
        <>
          Read what a proof
          <br className="hidden lg:block" /> actually says.
        </>
      }
      lede="Four public values and nothing else. This page shows each one for a real proof, what it tells a verifier, what it does not, and what can stay visible through other layers."
      wide
    >
      <ReviewDesk />
    </PageHero>
  );
}
