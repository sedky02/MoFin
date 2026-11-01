"use client";

import * as React from "react";
import {
  Database,
  Eraser,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  activeSectionAt,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

const ICONS: Record<SettingsSectionId, LucideIcon> = {
  profile: User,
  preferences: SlidersHorizontal,
  security: ShieldCheck,
  "connected-apps": Plug,
  data: Database,
  "delete-data": Eraser,
  "delete-account": Trash2,
};

/**
 * Jump links to each Settings section: a row of pills that sticks under the top
 * bar on small screens, a sticky list beside the content from lg up. The
 * highlighted entry follows the scroll position; clicking one highlights it and
 * keeps it until the reader scrolls again by hand.
 */
export function SettingsNav() {
  const [active, setActive] = React.useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id);
  // The entry the reader clicked, held while the page scrolls to it (a short last
  // section may never reach the offset the scroll position is judged against).
  const pinned = React.useRef<SettingsSectionId | null>(null);

  React.useEffect(() => {
    let frame = 0;

    function measure() {
      frame = 0;
      if (pinned.current) {
        setActive(pinned.current);
        return;
      }
      const tops: Record<string, number> = {};
      for (const { id } of SETTINGS_SECTIONS) {
        const el = document.getElementById(id);
        if (el) tops[id] = el.getBoundingClientRect().top;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(activeSectionAt(tops, atBottom));
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // Any scrolling the reader does themselves releases a clicked entry.
    const release = () => {
      pinned.current = null;
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchmove", release, { passive: true });
    window.addEventListener("keydown", release);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchmove", release);
      window.removeEventListener("keydown", release);
    };
  }, []);

  function goTo(event: React.MouseEvent<HTMLAnchorElement>, id: SettingsSectionId) {
    const el = document.getElementById(id);
    if (!el) return; // without the section, the plain link still works
    event.preventDefault();
    pinned.current = id;
    setActive(id);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    // Moves keyboard focus along with the view, so the next Tab starts in that section.
    el.focus({ preventScroll: true });
  }

  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        // Small screens: pills pinned under the 3.5rem top bar, edge to edge.
        "sticky top-14 z-20 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6",
        // lg: a plain sticky list beside the content.
        "lg:top-20 lg:mx-0 lg:mb-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none",
      )}
    >
      <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
        {SETTINGS_SECTIONS.map(({ id, label }) => {
          const isActive = active === id;
          const Icon = ICONS[id];
          return (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                aria-current={isActive ? "location" : undefined}
                onClick={(event) => goTo(event, id)}
                className={cn(
                  "flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm transition-colors pointer-coarse:min-h-11 lg:rounded-lg lg:px-3",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary/15 font-medium text-primary-text"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  id === "delete-account" && !isActive && "hover:text-destructive",
                )}
              >
                <Icon className="hidden size-4 shrink-0 lg:block" aria-hidden />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
