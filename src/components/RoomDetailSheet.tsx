"use client";

import { ImageGallery } from "@/components/ImageGallery";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const AMENITIES_SHOW_MORE_THRESHOLD = 5;

/** Parse room description HTML into sections (label bold + content). Safe: strips script/style. Works in SSR and client. */
function parseRoomDescription(html: string): { label?: string; content: string }[] {
  if (!html?.trim()) return [];
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, " ").replace(/<\/p>\s*<p/gi, " ").replace(/<\/?p>/gi, " ");
  const sections: { label?: string; content: string }[] = [];
  const strongRegex = /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = strongRegex.exec(s)) !== null) {
    const before = s.slice(lastIndex, m.index).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (before) sections.push({ content: before });
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (label) sections.push({ label });
    lastIndex = strongRegex.lastIndex;
  }
  const after = s.slice(lastIndex).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (after) sections.push({ content: after });
  return sections.filter((x) => (x.label ?? x.content));
}

export interface RoomTypeOffer {
  offerId: string;
  boardName: string;
  totalAmount: number;
  currency: string;
  taxIncluded?: boolean;
  payAtPropertyAmount?: number;
  refundableTag?: string;
  cancelTime?: string;
  mappedRoomId?: number;
}

export interface RoomGroup {
  roomId: number;
  roomName: string;
  displayName: string;
  image?: string;
  offers: RoomTypeOffer[];
}

interface RoomMeta {
  id: number;
  roomName: string;
  description?: string;
  roomSizeSquare?: number;
  roomSizeUnit?: string;
  maxOccupancy?: number;
  bedTypes?: { quantity?: number; bedType?: string; bedSize?: string }[];
  roomAmenities?: { name?: string }[];
  photos?: { url: string }[];
}

interface RoomDetailSheetProps {
  room: RoomGroup;
  roomMeta: RoomMeta | undefined;
  fallbackImages: { url: string }[];
  nights: number;
  occupanciesCount: number;
  onSelectOffer: (offer: RoomTypeOffer) => void;
  onClose: () => void;
  isExiting?: boolean;
}

function isNonRefundable(offer: RoomTypeOffer): boolean {
  return offer.refundableTag === "NRF" || offer.refundableTag === "NRFN";
}

function cancellationLabel(offer: RoomTypeOffer): string {
  if (isNonRefundable(offer)) return "Non-refundable";
  if (offer.cancelTime) return `Free cancellation until ${offer.cancelTime}`;
  return "Flexible cancellation";
}

export function RoomDetailSheet({
  room,
  roomMeta,
  fallbackImages,
  nights,
  occupanciesCount,
  onSelectOffer,
  onClose,
  isExiting = false
}: RoomDetailSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [amenitiesExpanded, setAmenitiesExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Customize your stay: cancellation type first (Non-refundable | Free cancellation), then board filtered by that type
  const hasNonRefundable = useMemo(
    () => room.offers.some(isNonRefundable),
    [room.offers]
  );
  const hasFreeCancellation = useMemo(
    () => room.offers.some((o) => !isNonRefundable(o)),
    [room.offers]
  );
  const cancellationTypes = useMemo(() => {
    const out: ("Non-refundable" | "Free cancellation")[] = [];
    if (hasNonRefundable) out.push("Non-refundable");
    if (hasFreeCancellation) out.push("Free cancellation");
    return out;
  }, [hasNonRefundable, hasFreeCancellation]);

  const [selectedCancellationType, setSelectedCancellationType] = useState<
    "Non-refundable" | "Free cancellation"
  >(() => (hasNonRefundable ? "Non-refundable" : "Free cancellation"));

  // Board options: only boards that have an offer matching the selected cancellation type
  const boardOptionsForCancellation = useMemo(() => {
    const match = selectedCancellationType === "Non-refundable" ? isNonRefundable : (o: RoomTypeOffer) => !isNonRefundable(o);
    const names = new Set<string>();
    room.offers.filter(match).forEach((o) => names.add(o.boardName?.trim() || "Room Only"));
    return Array.from(names);
  }, [room.offers, selectedCancellationType]);

  const [selectedBoard, setSelectedBoard] = useState<string>(() => {
    const defaultType = hasNonRefundable ? "Non-refundable" : "Free cancellation";
    const match = defaultType === "Non-refundable" ? isNonRefundable : (o: RoomTypeOffer) => !isNonRefundable(o);
    const firstMatch = room.offers.find(match);
    return firstMatch ? (firstMatch.boardName?.trim() || "Room Only") : "";
  });

  // When cancellation type (or list) changes, reset board to first available if current is not in list
  useEffect(() => {
    if (boardOptionsForCancellation.length > 0 && !boardOptionsForCancellation.includes(selectedBoard)) {
      setSelectedBoard(boardOptionsForCancellation[0]);
    }
  }, [selectedCancellationType, selectedBoard, boardOptionsForCancellation]);

  // Selected offer: for Free cancellation, pick the one with max (latest) cancelTime for the chosen board
  const selectedOffer = useMemo(() => {
    const boardName = selectedBoard || (room.offers[0]?.boardName?.trim() || "Room Only");
    const matchCancellation =
      selectedCancellationType === "Non-refundable" ? isNonRefundable : (o: RoomTypeOffer) => !isNonRefundable(o);
    const candidates = room.offers.filter(
      (o) => matchCancellation(o) && (o.boardName?.trim() || "Room Only") === boardName
    );
    if (candidates.length === 0) return room.offers[0] ?? null;
    if (selectedCancellationType === "Non-refundable") return candidates[0];
    // Free cancellation: pick offer with latest cancelTime (max date)
    return candidates.reduce((best, o) => {
      if (!o.cancelTime) return best ?? o;
      if (!best?.cancelTime) return o;
      return o.cancelTime > best.cancelTime ? o : best;
    }, candidates[0] as RoomTypeOffer);
  }, [room.offers, selectedCancellationType, selectedBoard]);

  const photos = roomMeta?.photos?.length
    ? roomMeta.photos.map((p) => ({ url: p.url }))
    : fallbackImages.length
      ? fallbackImages
      : room.image
        ? [{ url: room.image }]
        : [];
  const currentPhoto = photos[carouselIndex];

  const goToSlide = useCallback(
    (index: number) => {
      const i = Math.max(0, Math.min(index, photos.length - 1));
      setCarouselIndex(i);
      scrollRef.current?.scrollTo({ left: i * (scrollRef.current?.offsetWidth ?? 0), behavior: "smooth" });
    },
    [photos.length]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || photos.length <= 1) return;
    const onScroll = () => {
      const w = el.offsetWidth;
      if (w <= 0) return;
      const i = Math.round(el.scrollLeft / w);
      setCarouselIndex(Math.max(0, Math.min(i, photos.length - 1)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [photos.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Room details"
        className={`fixed left-0 right-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white border border-[var(--sky-blue)] border-b-0 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] ${isExiting ? "search-modal-exit" : "search-modal-enter"}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 pt-3 pb-1 bg-white border-b border-[var(--muted)]">
          <div className="w-10 shrink-0" aria-hidden="true" />
          <div className="w-10 h-1 rounded-full bg-[var(--muted)]" aria-hidden="true" />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-[var(--muted)] bg-white flex items-center justify-center text-[var(--dark-text)] hover:bg-[var(--light-bg)] transition-colors shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-4 pb-6 pt-0">
          {/* Image carousel */}
          {photos.length > 0 && (
            <div className="mb-4 -mx-4 relative">
              <div
                ref={scrollRef}
                className="flex overflow-x-auto snap-x snap-mandatory gap-0 scroll-smooth"
                style={{ scrollSnapType: "x mandatory" }}
              >
                {photos.map((img, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-full snap-start"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setGalleryInitialIndex(i);
                        setGalleryOpen(true);
                      }}
                      className="block w-full aspect-[4/3] bg-[var(--light-bg)]"
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  </div>
                ))}
              </div>
              {photos.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-2">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goToSlide(i)}
                      className={`h-1.5 rounded-full transition-colors ${i === carouselIndex ? "w-4 bg-[var(--primary)]" : "w-1.5 bg-[var(--muted)]"}`}
                      aria-label={`Image ${i + 1} of ${photos.length}`}
                    />
                  ))}
                </div>
              )}
              <div className="absolute right-4 top-4 text-xs font-medium text-white rounded-full px-2 py-0.5 bg-[var(--dark-text)]/70">
                {carouselIndex + 1}/{photos.length}
              </div>
            </div>
          )}

          <h3 className="text-lg font-bold text-[var(--dark-text)] mb-1">
            {room.displayName}
          </h3>

          {roomMeta?.description && (() => {
            const sections = parseRoomDescription(roomMeta.description);
            if (sections.length === 0) return null;
            return (
              <div className="mb-4 space-y-2">
                {sections.map((s, i) => (
                  <div key={i}>
                    {s.label && (
                      <p className="text-sm font-semibold text-[var(--dark-text)] mb-0.5">
                        {s.label}
                      </p>
                    )}
                    {s.content && (
                      <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                        {s.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Size & capacity */}
          {(roomMeta?.roomSizeSquare != null || roomMeta?.maxOccupancy != null) && (
            <div className="flex flex-wrap gap-4 text-sm text-[var(--muted-foreground)] mb-4">
              {roomMeta.roomSizeSquare != null && roomMeta.roomSizeUnit && (
                <span>
                  {roomMeta.roomSizeSquare} {roomMeta.roomSizeUnit}
                </span>
              )}
              {roomMeta.maxOccupancy != null && (
                <span>Up to {roomMeta.maxOccupancy} guests</span>
              )}
            </div>
          )}

          {/* Bed types */}
          {roomMeta?.bedTypes && roomMeta.bedTypes.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-[var(--dark-text)] uppercase tracking-wider mb-1">
                Beds
              </h4>
              <p className="text-sm text-[var(--muted-foreground)]">
                {roomMeta.bedTypes
                  .map(
                    (b) =>
                      `${b.quantity ?? 1} ${b.bedType ?? "Bed"}${b.bedSize ? ` (${b.bedSize})` : ""}`
                  )
                  .join(", ")}
              </p>
            </div>
          )}

          {/* Amenities (before Customize your stay) */}
          {roomMeta?.roomAmenities && roomMeta.roomAmenities.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-[var(--dark-text)] uppercase tracking-wider mb-2">
                Amenities
              </h4>
              <ul className="flex flex-wrap gap-2">
                {(amenitiesExpanded
                  ? roomMeta.roomAmenities
                  : roomMeta.roomAmenities.slice(0, AMENITIES_SHOW_MORE_THRESHOLD)
                ).map((a, i) => (
                  <li
                    key={i}
                    className="rounded-full bg-[var(--light-bg)] border border-[var(--muted)] px-3 py-1 text-xs text-[var(--dark-text)]"
                  >
                    {a.name ?? "—"}
                  </li>
                ))}
              </ul>
              {roomMeta.roomAmenities.length > AMENITIES_SHOW_MORE_THRESHOLD && !amenitiesExpanded && (
                <button
                  type="button"
                  onClick={() => setAmenitiesExpanded(true)}
                  className="mt-2 text-sm font-medium text-[var(--primary)] hover:underline"
                >
                  Show more
                </button>
              )}
            </div>
          )}

          {/* Customize your stay (only section for rates; no separate RATES & CANCELLATION) */}
          {room.offers.length > 0 && (
            <div className="mb-4 rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] p-3">
              <h4 className="text-xs font-semibold text-[var(--dark-text)] uppercase tracking-wider mb-3">
                Customize your stay
              </h4>
              {/* Step 1: Cancellation preference (default Non-refundable if both present) */}
              {cancellationTypes.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
                    Cancellation
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cancellationTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedCancellationType(type)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                          selectedCancellationType === type
                            ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                            : "bg-white text-[var(--dark-text)] border-[var(--muted)] hover:border-[var(--sky-blue)]"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Step 2: Board / extras (only boards that have the selected cancellation type) */}
              {boardOptionsForCancellation.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
                    Board / extras
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {boardOptionsForCancellation.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setSelectedBoard(b)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                          selectedBoard === b
                            ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                            : "bg-white text-[var(--dark-text)] border-[var(--muted)] hover:border-[var(--sky-blue)]"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Price + free cancellation date (max date for selected board) + CTA */}
              {selectedOffer && (
                <div className="pt-2 border-t border-[var(--muted)]">
                  {selectedCancellationType === "Free cancellation" && selectedOffer.cancelTime && (
                    <p className="text-xs text-[var(--muted-foreground)] mb-1">
                      Free cancellation until {selectedOffer.cancelTime}
                    </p>
                  )}
                  <p className="text-sm font-semibold text-[var(--dark-text)]">
                    {selectedOffer.currency}{" "}
                    {selectedOffer.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                    total
                    {nights > 0 && (
                      <> · {selectedOffer.currency}{" "}
                        {(selectedOffer.totalAmount / nights).toLocaleString(undefined, { maximumFractionDigits: 0 })}/night
                      </>
                    )}
                  </p>
                  {selectedOffer.payAtPropertyAmount != null && selectedOffer.payAtPropertyAmount > 0 && (
                    <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                      +{selectedOffer.currency}{" "}
                      {selectedOffer.payAtPropertyAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                      taxes/fees at property
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectOffer(selectedOffer);
                      onClose();
                    }}
                    className="mt-2 w-full rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors"
                  >
                    Select this rate
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {galleryOpen && (
        <ImageGallery
          images={photos}
          initialIndex={galleryInitialIndex}
          onClose={() => setGalleryOpen(false)}
          overlayClassName="z-[60]"
        />
      )}
    </>
  );
}
