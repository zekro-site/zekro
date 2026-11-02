"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

/*
 * A glass object that floats slowly, leans toward the pointer and drifts with the scroll. Everything runs on one
 * requestAnimationFrame per object, stops off screen, and stays still under prefers-reduced-motion.
 */
export function GlassObject({
  src,
  alt,
  width = 900,
  height = 900,
  className = "",
  priority = false,
  sizes = "(max-width: 768px) 88vw, 520px",
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = inner.current;
    const host = box.current;
    if (!el || !host) return;
    let raf = 0;
    let visible = true;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const start = performance.now();
    const seed = src.length;
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      const float = Math.sin((now - start) / 1500 + seed) * 5;
      const rect = host.getBoundingClientRect();
      const drift = (window.innerHeight / 2 - (rect.top + rect.height / 2)) * 0.04;
      el.style.transform = `translate3d(${(cx * 12).toFixed(2)}px, ${(cy * 10 + float + drift).toFixed(2)}px, 0) rotateX(${(-cy * 5).toFixed(2)}deg) rotateY(${(cx * 5).toFixed(2)}deg)`;
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", move);
    };
  }, [src]);
  return (
    <div ref={box} className={className} style={{ perspective: 1200 }}>
      <div ref={inner} style={{ willChange: "transform", transformStyle: "preserve-3d" }}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes={sizes}
          draggable={false}
          className="h-auto w-full select-none"
          style={{ filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.55)) drop-shadow(0 0 60px rgba(47,123,214,0.18))" }}
        />
      </div>
    </div>
  );
}
