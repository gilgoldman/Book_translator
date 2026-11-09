"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./icons";

/**
 * Swipeable photos (CSS scroll snap), with arrows and dots for mouse and keyboard.
 * One photo shows as a plain picture. Used for the recipe hero and for note photos.
 */
export function Carousel({ photos, label, className = "" }: { photos: string[]; label: string; className?: string }) {
  const t = useT();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = photos.length > 1;

  useEffect(() => {
    const el = track.current;
    if (!el || !many) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setIndex(Number((e.target as HTMLElement).dataset.i));
      },
      { root: el, threshold: 0.6 },
    );
    for (const slide of el.children) seen.observe(slide);
    return () => seen.disconnect();
  }, [many, photos]);

  // scrollIntoView keeps right-to-left pages right, where scrollLeft runs negative.
  const go = (i: number) => {
    const slide = track.current?.children[(i + photos.length) % photos.length];
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    slide?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest", inline: "start" });
  };

  if (!photos.length) return null;
  return (
    <div className={`carousel ${className}`} role="region" aria-roledescription={t("carousel.role")} aria-label={label}>
      <div
        ref={track}
        className="carousel-track"
        tabIndex={many ? 0 : undefined}
        onKeyDown={(e) => {
          // In a right-to-left page the next photo is to the left.
          const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
          if (!step) return;
          e.preventDefault();
          const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
          go(index + (rtl ? -step : step));
        }}
      >
        {photos.map((src, i) => (
          <div
            key={src}
            className="carousel-slide"
            data-i={i}
            aria-roledescription={many ? t("carousel.slide") : undefined}
            aria-label={many ? t("carousel.position", { n: i + 1, total: photos.length }) : undefined}
          >
            <img src={src} alt="" loading={i ? "lazy" : undefined} draggable={false} />
          </div>
        ))}
      </div>
      {many && (
        <>
          <button type="button" className="carousel-nav prev" onClick={() => go(index - 1)} aria-label={t("carousel.prev")}>
            <Icon name="prev" />
          </button>
          <button type="button" className="carousel-nav next" onClick={() => go(index + 1)} aria-label={t("carousel.next")}>
            <Icon name="next" />
          </button>
          <div className="carousel-dots">
            {photos.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={t("carousel.position", { n: i + 1, total: photos.length })}
                aria-current={i === index || undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The photo band at the top of a recipe. */
export function RecipeHero({ photos }: { photos: string[] }) {
  const t = useT();
  if (!photos.length) return null;
  return (
    <div className="r-hero">
      <Carousel photos={photos} label={t("carousel.recipePhotos")} />
    </div>
  );
}
