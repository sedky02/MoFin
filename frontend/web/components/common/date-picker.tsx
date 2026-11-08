"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** "2026-11-08" → a local Date for that day, or undefined. */
function parseDay(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toDayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DAY_LABEL = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

type DatePickerProps = {
  /** "YYYY-MM-DD", or "" for none. */
  value: string | undefined;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Lets the picked date be cleared, for optional filters. */
  clearable?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
};

/** A date field that opens the app's calendar instead of the browser's own picker. */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  disabled,
  className,
  clearable = false,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDay(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          {...aria}
          className={cn(
            "h-9 w-full justify-start gap-2 px-3 text-left font-normal tabular",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 text-muted-foreground" aria-hidden />
          {selected ? DAY_LABEL.format(selected) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="label"
          onSelect={(date) => {
            if (date) onChange(toDayString(date));
            else if (clearable) onChange("");
            setOpen(false);
          }}
          autoFocus
        />
        {clearable && selected && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);
const pad2 = (n: number) => String(n).padStart(2, "0");

const DATE_TIME_LABEL = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function TimeColumn({
  items,
  current,
  text,
  onPick,
  name,
}: {
  items: number[];
  current: number;
  text: (n: number) => string;
  onPick: (n: number) => void;
  name: string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  // Centres the chosen value inside the column only; scrollIntoView would also scroll the page.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    const chosen = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && chosen) list.scrollTop = chosen.offsetTop - list.clientHeight / 2 + chosen.offsetHeight / 2;
  }, [current]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={name}
      className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1.5 py-1 [scrollbar-width:none]"
    >
      {items.map((n) => (
        <button
          key={n}
          type="button"
          role="option"
          aria-selected={n === current}
          onClick={() => onPick(n)}
          className={cn(
            "h-9 shrink-0 rounded-lg text-sm tabular transition-colors hover:bg-muted",
            n === current && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
          )}
        >
          {text(n)}
        </button>
      ))}
    </div>
  );
}

/**
 * A date and time field ("YYYY-MM-DDTHH:mm") as one control: it shows "Nov 8, 2026, 9:59 PM" and
 * opens one picker with the calendar beside hour and minute columns.
 */
export function DateTimePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  ...aria
}: Omit<DatePickerProps, "clearable" | "placeholder">) {
  const [open, setOpen] = React.useState(false);
  const day = parseDay(value);
  const [hour, minute] = (value?.slice(11, 16) || "12:00").split(":").map(Number);
  const dayString = day ? toDayString(day) : toDayString(new Date());
  const set = (nextDay: string, h: number, m: number) => onChange(`${nextDay}T${pad2(h)}:${pad2(m)}`);
  const hourLabel = (h: number) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2000, 0, 1, h));
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, hour, minute),
  );
  const label = day
    ? DATE_TIME_LABEL.format(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute))
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          {...aria}
          className={cn(
            "h-9 w-full justify-start gap-2 px-3 text-left font-normal tabular",
            !label && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{label ?? "Pick a date and time"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex max-sm:flex-col">
          <Calendar
            mode="single"
            selected={day}
            defaultMonth={day}
            captionLayout="label"
            fixedWeeks
            onSelect={(date) => date && set(toDayString(date), hour, minute)}
            autoFocus
          />
          {/* Takes the calendar's height: the columns sit in an absolute box so they never stretch it. */}
          <div className="relative w-36 border-l max-sm:h-52 max-sm:w-full max-sm:border-t max-sm:border-l-0">
            <div className="absolute inset-0 flex flex-col pt-3 pb-3">
              <div className="flex h-9 shrink-0 items-center justify-between px-3">
                <span className="text-[15px] font-semibold">Time</span>
                <span className="text-sm text-muted-foreground tabular">{timeLabel}</span>
              </div>
              <div className="mt-4 flex min-h-0 flex-1 divide-x">
                <TimeColumn
                  items={HOURS}
                  current={hour}
                  text={hourLabel}
                  onPick={(h) => set(dayString, h, minute)}
                  name="Hour"
                />
                <TimeColumn
                  items={MINUTES}
                  current={minute}
                  text={pad2}
                  onPick={(m) => set(dayString, hour, m)}
                  name="Minute"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t px-3 py-2.5">
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
