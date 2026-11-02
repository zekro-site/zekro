/*
 * Every brand image path in one place. The logo set is the owner's artwork (2026/november/1/assets/apply-owner-art.mjs); the glass
 * objects are still AI-made (referensi/tools/make-brand.mjs). Replace a file and keep its name, or change the path here.
 */
export const ASSETS = {
  /** Mark, transparent. 256x256 (header, footer, wallet, cards). */
  mark: "/brand/mark.webp",
  markLarge: "/brand/mark-512.webp",
  /** Square avatar on the ground colour. 512x512. */
  avatar: "/brand/avatar.webp",
  /** Banner for X. 1500x500. */
  banner: "/brand/banner.webp",
  /** Glass objects, transparent. */
  objects: {
    hero: { src: "/brand/hero-tree.webp", alt: "A blue glass tree of joined spheres, one root above its leaves" },
    gem: { src: "/brand/obj-gem.webp", alt: "A cut blue glass gem held inside a thin ring" },
    eye: { src: "/brand/obj-eye.webp", alt: "A blue glass ball with a dished pupil inside a tilted ring" },
    steps: { src: "/brand/obj-steps.webp", alt: "Blue glass blocks climbing in a spiral" },
    links: { src: "/brand/obj-links.webp", alt: "Two blue glass rings passing through each other" },
    key: { src: "/brand/obj-key.webp", alt: "A blue glass key" },
  },
  /** Square PNG served by Next from src/app/icon.png (structured data needs a PNG logo). */
  icon: "/icon.png",
  logoPng: "/icon.png",
  /** Share card served from src/app/opengraph-image.jpg; twitter-image.jpg is the same image. */
  og: "/opengraph-image.jpg",
} as const;
