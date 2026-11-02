import { PageHero } from "@/components/site/PageHero";
import { VerifyDesk } from "@/components/verify/VerifyDesk";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/verify",
  title: `Check a proof yourself | ${BRAND.name}`,
  description: `Paste a transaction hash or a proof bundle and ${BRAND.name} checks the zero-knowledge proof in your own tab with the published verification key.`,
});

export default function VerifyPage() {
  return (
    <PageHero label="Verify" title="Check any proof yourself." lede="Give it a transaction hash or a bundle. The public values are rebuilt on your device, then tested with the public key. You do not have to take our word for it.">
      <VerifyDesk />
    </PageHero>
  );
}
