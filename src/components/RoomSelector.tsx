"use client";

import {
  CHILD_AGE_MAX,
  CHILD_AGE_MIN,
  MAX_ADULTS_PER_ROOM,
  MAX_CHILDREN_PER_ROOM,
  MAX_ROOMS,
  MIN_ADULTS_PER_ROOM,
  MIN_ROOMS,
  type Occupancy,
  totalAdults,
  totalChildren,
  totalGuests
} from "@/lib/occupancy";
import { useCallback, useState } from "react";

type RoomSelectorVariant = "default" | "whoStep";

interface RoomSelectorProps {
  occupancies: Occupancy[];
  onChange: (occupancies: Occupancy[]) => void;
  className?: string;
  /** "whoStep" = always expanded, card per room, "Add another room", "Contact us" (for SearchModal Who view). */
  variant?: RoomSelectorVariant;
}

export function RoomSelector({
  occupancies,
  onChange,
  className = "",
  variant = "default"
}: RoomSelectorProps) {
  const [open, setOpen] = useState(false);
  const rooms = occupancies.length;
  const guests = totalGuests(occupancies);
  const adultsTotal = totalAdults(occupancies);
  const childrenTotal = totalChildren(occupancies);
  const isWhoStep = variant === "whoStep";

  const summary =
    rooms === 1 && childrenTotal === 0
      ? `${adultsTotal} ${adultsTotal === 1 ? "adult" : "adults"}`
      : `${rooms} ${rooms === 1 ? "room" : "rooms"} · ${guests} ${guests === 1 ? "guest" : "guests"}`;

  const setRoomCount = useCallback(
    (count: number) => {
      const n = Math.max(MIN_ROOMS, Math.min(MAX_ROOMS, count));
      if (n === occupancies.length) return;
      if (n > occupancies.length) {
        const next = [...occupancies];
        while (next.length < n) {
          next.push({ adults: MIN_ADULTS_PER_ROOM, children: [] });
        }
        onChange(next);
      } else {
        onChange(occupancies.slice(0, n));
      }
    },
    [occupancies, onChange]
  );

  const updateRoom = useCallback(
    (index: number, updater: (prev: Occupancy) => Occupancy) => {
      const next = occupancies.map((o, i) => (i === index ? updater(o) : o));
      onChange(next);
    },
    [occupancies, onChange]
  );

  const removeRoomAt = useCallback(
    (index: number) => {
      if (index < 1 || occupancies.length <= MIN_ROOMS) return;
      const next = occupancies.filter((_, i) => i !== index);
      onChange(next);
    },
    [occupancies, onChange]
  );

  /** Sentinel for "age not yet selected" (whoStep: user must choose from dropdown). */
  const CHILD_AGE_UNSET = -1;

  const roomContent = (
    <>
      {!isWhoStep && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--dark-text)]">Rooms</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRoomCount(rooms - 1)}
              disabled={rooms <= MIN_ROOMS}
              className="h-8 w-8 rounded-full border border-[var(--muted)] text-[var(--dark-text)] flex items-center justify-center text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Fewer rooms"
            >
              –
            </button>
            <span className="text-sm font-medium text-[var(--dark-text)] w-6 text-center">
              {rooms}
            </span>
            <button
              type="button"
              onClick={() => setRoomCount(rooms + 1)}
              disabled={rooms >= MAX_ROOMS}
              className="h-8 w-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-lg leading-none font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="More rooms"
            >
              +
            </button>
          </div>
        </div>
      )}
      {occupancies.map((room, index) => (
        <div
          key={index}
          className={
            isWhoStep
              ? "p-4 rounded-xl border border-[var(--sky-blue)] bg-[var(--light-bg)] hover:border-[var(--ocean-blue)] transition-colors"
              : "border-t border-[var(--muted)] pt-3 first:border-t-0 first:pt-0"
          }
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div
              className={
                isWhoStep
                  ? "text-sm font-bold text-[var(--dark-text)]"
                  : "text-xs font-medium text-[var(--muted-foreground)]"
              }
            >
              Room {index + 1}
            </div>
            {isWhoStep && index >= 1 && (
              <button
                type="button"
                onClick={() => removeRoomAt(index)}
                className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
              >
                Remove room
              </button>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--dark-text)]">
                Adults
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateRoom(index, (o) => ({
                      ...o,
                      adults: Math.max(MIN_ADULTS_PER_ROOM, o.adults - 1)
                    }))
                  }
                  disabled={room.adults <= MIN_ADULTS_PER_ROOM}
                  className="h-7 w-7 rounded-full border border-[var(--muted)] text-[var(--dark-text)] flex items-center justify-center text-sm leading-none disabled:opacity-40 hover:border-[var(--sky-blue)] transition-colors"
                  aria-label={`Room ${index + 1} fewer adults`}
                >
                  –
                </button>
                <span className="text-sm text-[var(--dark-text)] w-5 text-center">
                  {room.adults}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateRoom(index, (o) => ({
                      ...o,
                      adults: Math.min(MAX_ADULTS_PER_ROOM, o.adults + 1)
                    }))
                  }
                  disabled={room.adults >= MAX_ADULTS_PER_ROOM}
                  className="h-7 w-7 rounded-full bg-[var(--primary)]/80 text-white flex items-center justify-center text-sm leading-none font-semibold disabled:opacity-40 hover:bg-[var(--primary)] transition-colors"
                  aria-label={`Room ${index + 1} more adults`}
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--dark-text)]">
                  Children
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateRoom(index, (o) => {
                        if (o.children.length === 0) return o;
                        const next = o.children.slice(0, -1);
                        return { ...o, children: next };
                      })
                    }
                    disabled={room.children.length === 0}
                    className="h-7 w-7 rounded-full border border-[var(--muted)] text-[var(--dark-text)] flex items-center justify-center text-sm leading-none disabled:opacity-40 hover:border-[var(--sky-blue)] transition-colors"
                    aria-label={`Room ${index + 1} fewer children`}
                  >
                    –
                  </button>
                  <span className="text-sm text-[var(--dark-text)] w-5 text-center">
                    {room.children.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateRoom(index, (o) => {
                        if (o.children.length >= MAX_CHILDREN_PER_ROOM)
                          return o;
                        return {
                          ...o,
                          children: [...o.children, isWhoStep ? CHILD_AGE_UNSET : 8]
                        };
                      })
                    }
                    disabled={room.children.length >= MAX_CHILDREN_PER_ROOM}
                    className="h-7 w-7 rounded-full bg-[var(--primary)]/80 text-white flex items-center justify-center text-sm leading-none font-semibold disabled:opacity-40 hover:bg-[var(--primary)] transition-colors"
                    aria-label={`Room ${index + 1} more children`}
                  >
                    +
                  </button>
                </div>
              </div>
              {isWhoStep && room.children.length > 0 && (
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Ages 0 to 17
                </p>
              )}
              {room.children.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {room.children.map((age, childIndex) => (
                    <label
                      key={childIndex}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <span className="text-[var(--muted-foreground)] shrink-0">
                        Child {childIndex + 1} age
                        {isWhoStep && (
                          <span className="text-red-500 ml-0.5">*</span>
                        )}
                      </span>
                      {isWhoStep ? (
                        <select
                          value={age}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            const value =
                              Number.isNaN(v) ? CHILD_AGE_UNSET : Math.max(CHILD_AGE_MIN, Math.min(CHILD_AGE_MAX, v));
                            updateRoom(index, (o) => ({
                              ...o,
                              children: o.children.map((a, i) =>
                                i === childIndex ? value : a
                              )
                            }));
                          }}
                          className="rounded-lg border border-[var(--muted)] bg-white px-2.5 py-1.5 text-[var(--dark-text)] text-sm min-w-[5rem] focus:border-[var(--sky-blue)] focus:outline-none focus:ring-1 focus:ring-[var(--sky-blue)]"
                        >
                          <option value={CHILD_AGE_UNSET}>Select age</option>
                          {Array.from(
                            { length: CHILD_AGE_MAX - CHILD_AGE_MIN + 1 },
                            (_, i) => CHILD_AGE_MIN + i
                          ).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={CHILD_AGE_MIN}
                          max={CHILD_AGE_MAX}
                          value={age === CHILD_AGE_UNSET ? "" : age}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            const clamped = Number.isNaN(v)
                              ? CHILD_AGE_MIN
                              : Math.max(
                                  CHILD_AGE_MIN,
                                  Math.min(CHILD_AGE_MAX, v)
                                );
                            updateRoom(index, (o) => ({
                              ...o,
                              children: o.children.map((a, i) =>
                                i === childIndex ? clamped : a
                              )
                            }));
                          }}
                          className="w-12 rounded border border-[var(--muted)] bg-white px-1.5 py-0.5 text-[var(--dark-text)] text-center"
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {isWhoStep && (
        <>
          <button
            type="button"
            onClick={() => setRoomCount(rooms + 1)}
            disabled={rooms >= MAX_ROOMS}
            className="mt-3 w-full py-3 rounded-xl border-2 border-dashed border-[var(--muted)] text-[var(--muted-foreground)] text-sm font-medium hover:border-[var(--sky-blue)] hover:text-[var(--dark-text)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add another room
          </button>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Need to book 9 or more rooms?{" "}
            <a
              href="/contact"
              className="text-[var(--primary)] font-medium hover:underline"
            >
              Contact us
            </a>
          </p>
        </>
      )}
    </>
  );

  if (isWhoStep) {
    return (
      <div className={className}>
        <div className="p-4 space-y-3">{roomContent}</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="text-xs font-medium text-[var(--dark-text)] block mb-1">
        Rooms &amp; guests
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-[var(--sky-blue)] bg-white px-3 py-2 text-left text-sm text-[var(--dark-text)] hover:border-[var(--ocean-blue)] transition-colors"
      >
        <span>{summary}</span>
        <span className="text-[var(--muted-foreground)] text-lg leading-none">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="mt-3 p-3 rounded-xl border border-[var(--muted)] bg-[var(--light-bg)] space-y-4">
          {roomContent}
        </div>
      )}
    </div>
  );
}
