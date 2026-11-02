import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

const ROUTES = ["", "/prove", "/verify", "/stats", "/review", "/docs", "/token"];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((r) => ({ url: `${BRAND.url}${r}`, priority: r === "" ? 1 : 0.6, changeFrequency: "weekly" }));
}
