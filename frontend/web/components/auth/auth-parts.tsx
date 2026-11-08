import { cn } from "@/lib/utils";

export const AUTH_INPUT =
  "h-[50px] pointer-coarse:h-[50px] rounded-xl bg-card px-3.5 text-[15px] md:text-[15px] placeholder:opacity-70";
export const AUTH_LABEL = "text-[13px] font-semibold";
export const AUTH_BUTTON = "h-[52px] w-full gap-2.5 rounded-[14px] text-[15px] font-semibold";
export const AUTH_LINK = "font-semibold text-primary-text underline-offset-4 hover:underline";

/** Eyebrow, two-tone title and subtitle. `compact` is for the longest form, so it fits one screen. */
export function AuthHeading({
  eyebrow,
  title,
  accent,
  subtitle,
  compact = false,
  align = "left",
  headingRef,
}: {
  eyebrow?: string;
  title: string;
  accent: string;
  subtitle?: React.ReactNode;
  compact?: boolean;
  align?: "left" | "center";
  /** Lets a screen move focus to its new content, so keyboard and screen reader users land on it. */
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <header className={cn(compact ? "mb-7" : "mb-11", align === "center" && "text-center")}>
      {eyebrow && (
        <p className={cn("text-xs font-bold uppercase tracking-[0.09em] text-primary-text", compact ? "mb-3" : "mb-5")}>
          {eyebrow}
        </p>
      )}
      <h1
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className="font-heading text-[34px] leading-[1.1] font-bold tracking-[-0.03em] text-balance outline-none"
      >
        {title} <span className="text-primary-text">{accent}</span>
      </h1>
      {subtitle && (
        <p className={cn("text-[15px] leading-relaxed text-muted-foreground", compact ? "mt-3" : "mt-4")}>
          {subtitle}
        </p>
      )}
    </header>
  );
}

export function AuthDivider({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn("flex items-center gap-3.5 text-xs tracking-[0.08em] text-muted-foreground", compact ? "my-5" : "my-9")}
    >
      <span className="h-px flex-1 bg-border" />
      OR
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** The "other screen" line, always under the form. */
export function AuthSwitch({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-10 text-center text-sm text-muted-foreground", className)}>{children}</p>;
}

const STRENGTH = [
  { label: "Too short", cls: "bg-destructive" },
  { label: "Weak", cls: "bg-destructive" },
  { label: "Fair", cls: "bg-warning" },
  { label: "Good", cls: "bg-primary" },
  { label: "Strong", cls: "bg-success" },
];

/** Four segments that fill with the score (0-4), the hint on the left and the verdict on the right. */
export function PasswordStrengthMeter({
  strength,
  hasValue,
  hint,
  compact = false,
}: {
  strength: number;
  hasValue: boolean;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div>
      <div aria-hidden className="grid grid-cols-4 gap-[5px]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn("h-[5px] rounded-[3px] transition-colors", i < strength ? STRENGTH[strength].cls : "bg-border")}
          />
        ))}
      </div>
      <div className={cn("flex justify-between text-[12.5px] text-muted-foreground", compact ? "mt-2.5" : "mt-3")}>
        <span>{hint}</span>
        <b className="font-semibold text-foreground">{hasValue ? STRENGTH[strength].label : ""}</b>
      </div>
    </div>
  );
}

export function AuthChips({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 flex flex-wrap justify-center gap-2.5">{children}</div>;
}

export function AuthChip({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}
