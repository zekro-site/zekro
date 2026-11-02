import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { ChainProvider } from "@/components/providers/ChainProvider";
import { Motion } from "@/components/site/Motion";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { WalletModalProvider } from "@/components/wallet/WalletButton";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { BRAND } from "@/config/brand";
import { HOME_DESCRIPTION, HOME_TITLE, siteLd } from "@/lib/seo";

const manrope = localFont({ src: "../fonts/manrope-latin-wght-normal.woff2", variable: "--font-manrope", weight: "200 800", display: "swap" });
const spline = localFont({
  src: [
    { path: "../fonts/spline-sans-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/spline-sans-mono-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-spline-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: HOME_TITLE, template: `%s | ${BRAND.name}` },
  description: HOME_DESCRIPTION,
  applicationName: BRAND.name,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: BRAND.name, title: HOME_TITLE, description: HOME_DESCRIPTION, url: BRAND.url, locale: "en_US" },
  twitter: { card: "summary_large_image", site: BRAND.xHandle, creator: BRAND.xHandle, title: HOME_TITLE, description: HOME_DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#08090C", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`no-js ${manrope.variable} ${spline.variable}`} suppressHydrationWarning>
      <body className="flex min-h-svh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-ground">
          Skip to content
        </a>
        <JsonLd data={siteLd} />
        <WalletProvider>
          <WalletModalProvider>
            <ChainProvider>
              <Motion />
              <SiteHeader />
              <main id="main" className="flex-1">
                {children}
              </main>
              <SiteFooter />
            </ChainProvider>
          </WalletModalProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
