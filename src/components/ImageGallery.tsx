"use client";

import { useCallback, useEffect, useState } from "react";

interface ImageGalleryProps {
  images: { url: string }[];
  initialIndex?: number;
  onClose: () => void;
  /** Optional class for the overlay (e.g. z-[60] when opening from a sheet). */
  overlayClassName?: string;
}

export function ImageGallery({
  images,
  initialIndex = 0,
  onClose,
  overlayClassName
}: ImageGalleryProps) {
  const [index, setIndex] = useState(initialIndex);
  const current = images[index];

  const goPrev = useCallback(() => {
    setIndex((i) => (i <= 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
  }, [images.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext]);

  if (images.length === 0) return null;

  return (
    <div
      className={`fixed inset-0 z-30 flex flex-col ${overlayClassName ?? ""}`}
      style={{ backgroundColor: "var(--dark-text)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full border border-[var(--sky-blue)] flex items-center justify-center text-lg bg-white/95 text-[var(--dark-text)]"
        aria-label="Close gallery"
      >
        ×
      </button>

      <div
        className="flex-1 flex items-center justify-center min-h-0 relative cursor-pointer"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full border border-[var(--sky-blue)] flex items-center justify-center text-xl bg-white/95 text-[var(--dark-text)]"
          aria-label="Previous image"
        >
          ‹
        </button>
        <div
          className="flex-1 flex items-center justify-center p-4 max-w-full max-h-full cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={current.url}
            alt=""
            className="max-w-full max-h-[85vh] w-auto h-auto object-contain"
            draggable={false}
          />
        </div>
        <button
          type="button"
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full border border-[var(--sky-blue)] flex items-center justify-center text-xl bg-white/95 text-[var(--dark-text)]"
          aria-label="Next image"
        >
          ›
        </button>
      </div>

      <div className="py-2 text-center text-xs text-[var(--muted-foreground)]">
        {index + 1} / {images.length}
      </div>
    </div>
  );
}
