"use client";

import * as React from "react";
import { pickActiveSection, SETTINGS_SECTIONS, type SettingsSectionId } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

/**
 * Jump links to each Settings section: a scrolling row of pills on small
 * screens, a sticky list beside the content from lg up. The section on screen
 * is highlighted.
 */
export function SettingsNav() {
  const [active, setActive] = React.useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id);

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setActive((previous) => pickActiveSection(visible, previous));
      },
      // A section counts once its top reaches the upper part of the viewport.
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const { id } of SETTINGS_SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Settings sections" className="-mx-4 mb-6 px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-20 lg:mx-0 lg:mb-0 lg:self-start lg:px-0">
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {SETTINGS_SECTIONS.map(({ id, label }) => {
          const isActive = active === id;
          return (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                aria-current={isActive ? "location" : undefined}
                onClick={() => setActive(id)}
                className={cn(
                  "flex min-h-9 items-center rounded-full px-3.5 text-sm transition-colors pointer-coarse:min-h-11 lg:rounded-lg lg:px-3",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary/15 font-medium text-primary-text"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  id === "delete-account" && !isActive && "hover:text-destructive",
                )}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
