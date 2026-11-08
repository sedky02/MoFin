"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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

/** A date and time field ("YYYY-MM-DDTHH:mm"): the app's calendar for the day, a time box beside it. */
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
    <div className="flex gap-2">
      <DatePicker
        id={id}
        value={day}
        disabled={disabled}
        className={cn("flex-1", className)}
        onChange={(next) => onChange(`${next}T${time}`)}
        {...aria}
      />
      <Input
        type="time"
        aria-label="Time"
        value={time}
        disabled={disabled}
        className={cn("w-28 tabular", className)}
        onChange={(event) => day && onChange(`${day}T${event.target.value || "00:00"}`)}
      />
    </div>
  );
}
