import Link from "next/link";
import { ArrowRight } from "@/components/site/Icons";
import { PageHero } from "@/components/site/PageHero";

export default function NotFound() {
  return (
    <PageHero label="404" title="Nothing here." lede="That page does not exist. The studio and the proving lab do.">
      <Link href="/" className="btn btn-light">
        <span>Back home</span>
        <ArrowRight size={15} />
      </Link>
    </PageHero>
  );
}
