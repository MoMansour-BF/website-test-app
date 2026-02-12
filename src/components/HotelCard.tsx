"use client";

import { HeartIcon, HeartIconFilled, MapPinIcon } from "@/components/Icons";
import { formatDistance } from "@/lib/distance-utils";
import Link from "next/link";

export interface HotelCardHotel {
  id: string;
  name: string;
  main_photo?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  starRating?: number;
  persona?: string;
  tags?: string[];
}

export interface HotelCardPrice {
  amount: number;
  currency: string;
  refundableTag?: string;
  taxIncluded?: boolean;
}

interface HotelCardProps {
  hotel: HotelCardHotel;
  price?: HotelCardPrice;
  nights: number;
  occupanciesLength: number;
  hasRefundable?: boolean;
  href: string;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent) => void;
  /** Distance from search center in meters (optional) */
  distance?: number;
}

export function HotelCard({
  hotel,
  price,
  nights,
  occupanciesLength,
  hasRefundable,
  href,
  isFavorite,
  onToggleFavorite,
  distance,
}: HotelCardProps) {
  return (
    <Link
      href={href}
      className="results-card-hover block rounded-2xl border border-[var(--sky-blue)] bg-white overflow-hidden shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
    >
      {/* Image on top — vertical layout */}
      <div className="relative h-52 w-full overflow-hidden bg-[var(--muted)]">
        {hotel.main_photo ? (
          <img
            src={hotel.main_photo}
            alt={hotel.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">
            No photo
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(e);
          }}
          className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-[var(--muted-foreground)] hover:bg-[var(--light-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-colors duration-150 [&_svg]:transition-[fill,color] [&_svg]:duration-150"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? (
            <HeartIconFilled className="w-5 h-5 text-[var(--primary)]" />
          ) : (
            <HeartIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold leading-snug text-[var(--dark-text)]">
            {hotel.name}
          </h2>
          {hotel.starRating != null && hotel.starRating >= 1 && hotel.starRating <= 5 && (
            <span
              className="inline-flex items-center text-[var(--star)] font-medium text-xs"
              aria-label={`${hotel.starRating} star rating`}
            >
              {"★".repeat(Math.round(hotel.starRating))}
              {"☆".repeat(5 - Math.round(hotel.starRating))}
            </span>
          )}
        </div>
        {hotel.address && (
          <p className="text-xs text-[var(--muted-foreground)] line-clamp-1">
            {hotel.address}
          </p>
        )}
        {distance != null && (
          <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
            <MapPinIcon className="w-3 h-3" />
            <span>{formatDistance(distance)} from center</span>
          </div>
        )}
        {/* Phase 4: always show reviews line; use "—" / "No reviews" when rating/reviewCount absent */}
        <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-xs">
          {hotel.rating != null ? (
            <span className="rounded bg-[var(--primary)]/10 px-1.5 py-0.5 font-medium text-[var(--primary)]">
              {hotel.rating.toFixed(1)}
            </span>
          ) : (
            <span className="text-[var(--muted-foreground)]">—</span>
          )}
          {hotel.reviewCount != null ? (
            <span className="text-[var(--muted-foreground)]">
              {hotel.reviewCount.toLocaleString()} reviews
            </span>
          ) : hotel.rating != null ? (
            <span className="text-[var(--muted-foreground)]">reviews</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">No reviews</span>
          )}
          {hotel.persona && (
            <span className="text-[var(--muted-foreground)]">· {hotel.persona}</span>
          )}
        </p>
        {/* Refundability */}
        {hasRefundable ? (
          <p className="mt-0.5 text-xs font-medium text-[var(--primary)]">
            Refundable
          </p>
        ) : price ? (
          <p
            className={
              price.refundableTag === "NRF" || price.refundableTag === "NRFN"
                ? "mt-0.5 text-xs font-medium text-red-600"
                : "mt-0.5 text-xs font-medium text-[var(--muted-foreground)]"
            }
          >
            {price.refundableTag === "NRF" || price.refundableTag === "NRFN"
              ? "Non-refundable"
              : "Free cancellation (see details)"}
          </p>
        ) : null}

        {price && (
          <div className="mt-2 pt-2 border-t border-[var(--muted)]">
            <div className="text-lg font-semibold text-[var(--primary)]">
              {price.currency}
              {nights > 0
                ? (price.amount / nights).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })
                : price.amount.toFixed(0)}
              <span className="font-normal text-[var(--muted-foreground)] text-sm">
                {" "}
                / night
              </span>
            </div>
            {nights > 0 && (
              <div className="text-sm font-medium text-[var(--dark-text)] mt-0.5">
                {price.currency}
                {price.amount.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{" "}
                Total
              </div>
            )}
            <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
              {nights} {nights === 1 ? "night" : "nights"}
              {", "}
              {occupanciesLength} {occupanciesLength === 1 ? "room" : "rooms"}
              {", "}
              {price.taxIncluded ? "incl. taxes & fees" : "+ taxes & fees"}
            </div>
          </div>
        )}
      </div>

      {hotel.tags && hotel.tags.length > 0 && (
        <div className="px-4 pb-4 pt-0 flex flex-wrap gap-1">
          {hotel.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--light-bg)] border border-[var(--sky-blue)] px-2 py-0.5 text-[10px] text-[var(--dark-text)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
