"use client";

import * as React from "react";
import type { FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";
import { onBeforeLoginRedirect } from "@/lib/api";
import { stashForm, takeStashedForm } from "@/lib/form-stash";

/**
 * Keeps a form's input across a session-expired redirect: if the API client
 * bounces to /login while the form has changes, the values go to
 * sessionStorage under `key`; the next time the form is ready (after signing
 * back in) they are put back once. Fields the user has already changed are
 * left alone. Returns true while restored input is on screen, for a notice.
 *
 * `ready` holds the restore until the data the form depends on has loaded;
 * `accept` can reject a stash that no longer fits (e.g. unknown account ids).
 */
export function useFormStash<T extends FieldValues>(
  form: UseFormReturn<T>,
  key: string,
  { ready, accept }: { ready: boolean; accept?: (values: Partial<T>) => boolean },
): boolean {
  // Read during render so react-hook-form keeps isDirty up to date for the callback below.
  const { isDirty } = form.formState;

  React.useEffect(
    () =>
      onBeforeLoginRedirect(() => {
        if (form.formState.isDirty) stashForm(key, form.getValues());
      }),
    [form, key],
  );

  const [restored, setRestored] = React.useState(false);
  const tried = React.useRef(false);
  React.useEffect(() => {
    if (!ready || tried.current) return;
    tried.current = true;
    const values = takeStashedForm<Partial<T>>(key);
    if (!values || (accept && !accept(values))) return;
    let changed = false;
    for (const [name, value] of Object.entries(values)) {
      const field = name as Path<T>;
      if (form.getFieldState(field).isDirty) continue;
      form.setValue(field, value as PathValue<T, Path<T>>, { shouldDirty: true });
      changed = true;
    }
    // A one-off read from sessionStorage; the setValue calls above re-render anyway.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (changed) setRestored(true);
    // `tried` makes this run once, so a new `accept` each render is harmless.
  }, [ready, form, key, accept]);

  return restored && isDirty;
}
