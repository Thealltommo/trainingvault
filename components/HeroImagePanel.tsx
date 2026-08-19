"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { HERO_IMAGES } from "@/lib/hero-images";

type HeroImagePanelProps = {
  src: string;
  title?: string;
  kicker?: string;
  className?: string;
  priority?: boolean;
  children?: ReactNode;
};

export default function HeroImagePanel({
  src,
  title,
  kicker,
  className = "",
  priority = false,
  children,
}: HeroImagePanelProps) {
  return (
    <section className={`hero-media ${className}`}>
      <Image
        src={src}
        alt=""
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) calc(100vw - 15rem), 1200px"
        className="object-cover"
        style={{ objectPosition: "60% center" }}
        preload={priority}
        loading={priority ? undefined : "lazy"}
        onError={(event) => {
          event.currentTarget.src = HERO_IMAGES.fallback;
        }}
      />
      <div className="hero-overlay" aria-hidden="true" />
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-stripe" aria-hidden="true" />
      <div className="relative z-10 flex h-full max-w-3xl flex-col justify-end p-4 sm:p-5 lg:p-6">
        {kicker ? <p className="text-[0.68rem] font-black uppercase tracking-[0.15em] text-[#81afff]">{kicker}</p> : null}
        {title ? <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl lg:text-5xl">{title}</h1> : null}
        {children}
      </div>
    </section>
  );
}
