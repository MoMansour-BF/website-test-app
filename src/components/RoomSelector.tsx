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

interface RoomSelectorProps {
  occupancies: Occupancy[];
  onChange: (occupancies: Occupancy[]) => void;
  className?: string;
}

export function RoomSelector({
  occupancies,
  onChange,
  className = ""
}: RoomSelectorProps) {
  const [open, setOpen] = useState(false);
  const rooms = occupancies.length;
  const guests = totalGuests(occupancies);
  const adultsTotal = totalAdults(occupancies);
  const childrenTotal = totalChildren(occupancies);

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

  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-300 block mb-1">
        Rooms &amp; guests
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm text-slate-50"
      >
        <span>{summary}</span>
        <span className="text-slate-400 text-lg leading-none">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="mt-3 p-3 rounded-xl border border-slate-700 bg-slate-900/80 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300">Rooms</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRoomCount(rooms - 1)}
                disabled={rooms <= MIN_ROOMS}
                className="h-8 w-8 rounded-full border border-slate-600 text-slate-200 flex items-center justify-center text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Fewer rooms"
              >
                –
              </button>
              <span className="text-sm font-medium text-slate-50 w-6 text-center">
                {rooms}
              </span>
              <button
                type="button"
                onClick={() => setRoomCount(rooms + 1)}
                disabled={rooms >= MAX_ROOMS}
                className="h-8 w-8 rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center text-lg leading-none font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="More rooms"
              >
                +
              </button>
            </div>
          </div>

          {occupancies.map((room, index) => (
            <div
              key={index}
              className="border-t border-slate-700 pt-3 first:border-t-0 first:pt-0"
            >
              <div className="text-xs font-medium text-slate-400 mb-2">
                Room {index + 1}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Adults</span>
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
                      className="h-7 w-7 rounded-full border border-slate-600 text-slate-200 flex items-center justify-center text-sm leading-none disabled:opacity-40"
                      aria-label={`Room ${index + 1} fewer adults`}
                    >
                      –
                    </button>
                    <span className="text-sm text-slate-50 w-5 text-center">
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
                      className="h-7 w-7 rounded-full bg-emerald-500/80 text-slate-900 flex items-center justify-center text-sm leading-none font-semibold disabled:opacity-40"
                      aria-label={`Room ${index + 1} more adults`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Children</span>
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
                      className="h-7 w-7 rounded-full border border-slate-600 text-slate-200 flex items-center justify-center text-sm leading-none disabled:opacity-40"
                      aria-label={`Room ${index + 1} fewer children`}
                    >
                      –
                    </button>
                    <span className="text-sm text-slate-50 w-5 text-center">
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
                            children: [...o.children, 8]
                          };
                        })
                      }
                      disabled={room.children.length >= MAX_CHILDREN_PER_ROOM}
                      className="h-7 w-7 rounded-full bg-emerald-500/80 text-slate-900 flex items-center justify-center text-sm leading-none font-semibold disabled:opacity-40"
                      aria-label={`Room ${index + 1} more children`}
                    >
                      +
                    </button>
                  </div>
                </div>
                {room.children.length > 0 && (
                  <div className="pl-0 pt-1 space-y-1">
                    <span className="text-[11px] text-slate-500 block">
                      Ages (0–17)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {room.children.map((age, childIndex) => (
                        <label
                          key={childIndex}
                          className="flex items-center gap-1 text-xs"
                        >
                          <span className="text-slate-400">
                            Child {childIndex + 1}:
                          </span>
                          <input
                            type="number"
                            min={CHILD_AGE_MIN}
                            max={CHILD_AGE_MAX}
                            value={age}
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
                            className="w-12 rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-slate-50 text-center [color-scheme:dark]"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
