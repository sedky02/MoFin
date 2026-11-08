import * as React from "react";
import { FormLabel } from "@/components/ui/form";
import { HelpHint } from "@/components/common/help-hint";
import { cn } from "@/lib/utils";

/** A form label with its explanation behind an info icon beside it, instead of a line under the field. */
export function FormLabelWithHint({
  children,
  hint,
  hintLabel,
  className,
}: {
  children: React.ReactNode;
  hint: React.ReactNode;
  /** What the info button is called for screen readers, e.g. "About the currency". */
  hintLabel: string;
  className?: string;
}) {
  return (
    <div className="-my-1 flex items-center gap-0.5">
      <FormLabel className={cn(className)}>{children}</FormLabel>
      <HelpHint label={hintLabel}>{hint}</HelpHint>
    </div>
  );
}
