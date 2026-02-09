"use client";

import { DateRangeCalendar } from "./DateRangeCalendar";
import {
  addDays,
  compareDay,
  formatDateForInput,
  formatRangeShort,
  getDaysBetween,
  parseYYYYMMDD,
} from "@/lib/date-utils";

const MAX_RANGE_DAYS = 30;
import { useCallback, useEffect, useRef, useState } from "react";

export interface DateRangePickerProps {
  checkin: string;
  checkout: string;
  onChange: (range: { checkin: string; checkout: string }) => void;
  minDate?: Date;
  placeholder?: string;
  className?: string;
  locale?: string;
  /** When provided, open state is controlled: no default trigger is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DateRangePicker({
  checkin,
  checkout,
  onChange,
  minDate = new Date(),
  placeholder = "Add dates",
  className,
  locale,
  open: controlledOpen,
  onOpenChange,
}: DateRangePickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = onOpenChange !== undefined ? controlledOpen ?? false : internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const today = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());

  // Focus first focusable when modal opens; return focus to trigger when it closes
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => resetButtonRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    if (onOpenChange === undefined && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open, onOpenChange]);

  // When opening, init from props
  useEffect(() => {
    if (open) {
      const cIn = parseYYYYMMDD(checkin);
      const cOut = parseYYYYMMDD(checkout);
      if (cIn && cOut && compareDay(cOut, cIn) > 0) {
        setStartDate(cIn);
        setEndDate(cOut);
      } else {
        setStartDate(null);
        setEndDate(null);
      }
    }
  }, [open, checkin, checkout]);

  const handleDaySelect = useCallback(
    (date: Date) => {
      if (!startDate) {
        setStartDate(date);
        setEndDate(null);
        return;
      }
      if (endDate != null && startDate) {
        setStartDate(date);
        setEndDate(null);
        return;
      }
      const cmp = compareDay(date, startDate);
      if (cmp <= 0) {
        setStartDate(date);
        setEndDate(null);
      } else {
        const cappedEnd =
          getDaysBetween(startDate, date) > MAX_RANGE_DAYS
            ? addDays(startDate, MAX_RANGE_DAYS - 1)
            : date;
        setEndDate(cappedEnd);
      }
    },
    [startDate, endDate]
  );

  const handleReset = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleNext = useCallback(() => {
    const start = startDate ?? today;
    let end = endDate ?? addDays(start, 1);
    if (compareDay(end, start) <= 0) end = addDays(start, 1);
    if (getDaysBetween(start, end) > MAX_RANGE_DAYS) {
      end = addDays(start, MAX_RANGE_DAYS - 1);
    }
    onChange({
      checkin: formatDateForInput(start),
      checkout: formatDateForInput(end),
    });
    handleClose();
  }, [startDate, endDate, today, onChange, handleClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;
      const reset = resetButtonRef.current;
      const next = nextButtonRef.current;
      if (!reset || !next) return;
      const focusables: HTMLElement[] = [reset, next];
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? focusables.indexOf(active) : -1;
      if (idx === -1) return;
      if (!e.shiftKey && idx === 1) {
        e.preventDefault();
        reset.focus();
      } else if (e.shiftKey && idx === 0) {
        e.preventDefault();
        next.focus();
      }
    },
    [handleClose]
  );

  const triggerLabel =
    checkin && checkout && parseYYYYMMDD(checkin) && parseYYYYMMDD(checkout)
      ? formatRangeShort(
          parseYYYYMMDD(checkin)!,
          parseYYYYMMDD(checkout)!,
          locale
        )
      : placeholder;

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(true)}
      className={
        className ??
        "w-full flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-left text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      }
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="Select dates"
    >
      <span className="text-slate-400 font-medium">When</span>
      <span className={checkin && checkout ? "font-medium" : "text-slate-500"}>
        {triggerLabel}
      </span>
    </button>
  );

  return (
    <>
      {onOpenChange === undefined && trigger}

      {open && (
        <div
          className="fixed inset-0 z-[50] bg-slate-950/80 flex items-end sm:items-center justify-center"
          onClick={handleClose}
          role="presentation"
        >
          <div
            ref={modalRef}
            className="bg-slate-900 dark:bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-md shadow-xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-label="When? Select check-in and check-out dates"
          >
            <h2 className="text-lg font-semibold text-slate-100 mb-3">When?</h2>

            <DateRangeCalendar
              minDate={today}
              startDate={startDate}
              endDate={endDate}
              onSelect={handleDaySelect}
              locale={locale}
            />

            <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800">
              <button
                ref={resetButtonRef}
                type="button"
                onClick={handleReset}
                className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Reset
              </button>
              <button
                ref={nextButtonRef}
                type="button"
                onClick={handleNext}
                className="rounded-full bg-emerald-500 text-slate-900 text-sm font-semibold px-5 py-2.5 hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
