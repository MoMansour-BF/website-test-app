"use client";

import {
  getDayNamesShort,
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthYearLabel,
  isInRange,
  isPastDay,
  isSameDay,
} from "@/lib/date-utils";
import { useState } from "react";

const INITIAL_MONTHS = 4;
const LOAD_MORE_MONTHS = 3;

export interface DateRangeCalendarProps {
  minDate: Date;
  startDate: Date | null;
  endDate: Date | null;
  onSelect: (date: Date) => void;
  locale?: string;
}

export function DateRangeCalendar({
  minDate,
  startDate,
  endDate,
  onSelect,
  locale,
}: DateRangeCalendarProps) {
  const [visibleMonthCount, setVisibleMonthCount] = useState(INITIAL_MONTHS);
  const today = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  const dayNames = getDayNamesShort(locale);

  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < visibleMonthCount; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  return (
    <div
      className="overflow-y-auto max-h-[60vh] pr-1 -mr-1"
      role="application"
      aria-label="Calendar"
    >
      {months.map(({ year, month }) => {
        const firstDay = getFirstDayOfMonth(year, month);
        const daysInMonth = getDaysInMonth(year, month);
        const leadingBlanks = firstDay;
        const totalCells = leadingBlanks + daysInMonth;
        const monthStart = new Date(year, month - 1, 1);
        const monthLabel = getMonthYearLabel(monthStart, locale);

        return (
          <section
            key={`${year}-${month}`}
            className="mb-6"
            aria-label={monthLabel}
          >
            <h3 className="text-base font-semibold text-[var(--dark-text)] mb-3">
              {monthLabel}
            </h3>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map((name, i) => (
                <div
                  key={i}
                  className="text-center text-xs font-medium text-[var(--muted-foreground)] py-1"
                >
                  {name}
                </div>
              ))}
            </div>
            <div
              className="grid grid-cols-7 gap-1"
              role="grid"
              aria-label={monthLabel}
            >
              {Array.from({ length: totalCells }, (_, i) => {
                if (i < leadingBlanks) {
                  return <div key={`empty-${i}`} className="aspect-square" />;
                }
                const day = i - leadingBlanks + 1;
                const date = new Date(year, month - 1, day);
                const isPast = isPastDay(date, today);
                const isStart = startDate !== null && isSameDay(date, startDate);
                const isEnd = endDate !== null && isSameDay(date, endDate);
                const inRange =
                  startDate !== null &&
                  endDate !== null &&
                  isInRange(date, startDate, endDate);

                const handleClick = () => {
                  if (isPast) return;
                  onSelect(date);
                };

                return (
                  <div
                    key={i}
                    role="gridcell"
                    aria-label={date.toLocaleDateString(locale)}
                    aria-disabled={isPast}
                    className="relative aspect-square flex items-center justify-center"
                  >
                    {/* Light grey range fill for days between start and end */}
                    {inRange && !isStart && !isEnd && (
                      <div
                        className="absolute inset-0 rounded-lg bg-[var(--muted)]"
                        aria-hidden
                      />
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={handleClick}
                      disabled={isPast}
                      className={`
                        relative z-10 w-full aspect-square flex items-center justify-center text-sm font-medium
                        transition-colors rounded-full
                        ${isPast
                          ? "text-[var(--muted-foreground)] line-through cursor-not-allowed"
                          : "cursor-pointer"
                        }
                        ${isStart
                          ? "bg-[var(--dark-text)] text-white hover:opacity-90"
                          : isEnd
                            ? "ring-2 ring-[var(--dark-text)] bg-[var(--dark-text)] text-white hover:opacity-90"
                            : inRange
                              ? "text-[var(--dark-text)] hover:bg-[var(--sky-blue)]/30"
                              : "text-[var(--dark-text)] hover:bg-[var(--muted)] hover:border hover:border-[var(--sky-blue)]"
                        }
                      `}
                    >
                      {day}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="flex justify-center pt-2 pb-4">
        <button
          type="button"
          onClick={() => setVisibleMonthCount((n) => n + LOAD_MORE_MONTHS)}
          className="rounded-lg border border-[var(--sky-blue)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dark-text)] hover:bg-[var(--light-bg)] transition-colors"
        >
          Load more dates
        </button>
      </div>
    </div>
  );
}
