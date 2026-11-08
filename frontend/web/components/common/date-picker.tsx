"use client";

import * as React from "react";
import { CalendarIcon, Clock } from "lucide-react";
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
          captionLayout="dropdown"
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

const TIME_LABEL = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** A time field ("HH:mm") that opens hour and minute columns instead of the browser's own time box. */
export function TimePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [hour, minute] = value.split(":").map(Number);
  const label = TIME_LABEL.format(new Date(2000, 0, 1, hour || 0, minute || 0));
  const hourLabel = (h: number) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2000, 0, 1, h));

  const column = (
    items: number[],
    current: number,
    text: (n: number) => string,
    pick: (n: number) => void,
    name: string,
  ) => (
    <div role="listbox" aria-label={name} className="flex max-h-56 w-20 flex-col gap-0.5 overflow-y-auto p-1">
      {items.map((n) => (
        <button
          key={n}
          type="button"
          role="option"
          aria-selected={n === current}
          ref={n === current ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
          onClick={() => pick(n)}
          className={cn(
            "rounded-md px-2 py-1.5 text-sm tabular transition-colors hover:bg-muted",
            n === current && "bg-primary font-medium text-primary-foreground hover:bg-primary",
          )}
        >
          {text(n)}
        </button>
      ))}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={`Time, ${label}`}
          className={cn("h-9 justify-start gap-2 px-3 font-normal tabular", className)}
        >
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto divide-x p-0" align="end">
        {column(HOURS, hour, hourLabel, (h) => onChange(`${pad2(h)}:${pad2(minute || 0)}`), "Hour")}
        {column(
          MINUTES,
          minute,
          pad2,
          (m) => {
            onChange(`${pad2(hour || 0)}:${pad2(m)}`);
            setOpen(false);
          },
          "Minute",
        )}
      </PopoverContent>
    </Popover>
  );
}

/** A date and time field ("YYYY-MM-DDTHH:mm"): the app's calendar for the day, the time picker beside it. */
export function DateTimePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  ...aria
}: Omit<DatePickerProps, "clearable" | "placeholder">) {
  const day = value?.slice(0, 10) ?? "";
  const time = value?.slice(11, 16) || "12:00";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <DatePicker
        id={id}
        value={day}
        disabled={disabled}
        className={className}
        onChange={(next) => onChange(`${next}T${time}`)}
        {...aria}
      />
      <TimePicker
        value={time}
        disabled={disabled || !day}
        className={className}
        onChange={(next) => onChange(`${day}T${next}`)}
      />
    </div>
  );
}
