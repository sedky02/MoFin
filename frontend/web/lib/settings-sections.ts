/** The Settings sections in page order; `id` is each card's anchor. */
export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "preferences", label: "Preferences" },
  { id: "security", label: "Security" },
  { id: "connected-apps", label: "Connected AI apps" },
  { id: "data", label: "Data" },
  { id: "delete-account", label: "Delete account" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/**
 * How far below the top of the viewport a section's top must have scrolled for
 * that section to count as the one being read. It clears the sticky top bar and
 * the mobile section row, with a little room to spare.
 */
export const ACTIVE_SECTION_OFFSET = 140;

/**
 * The section being read: the last one, in page order, whose top has reached
 * `offset` pixels from the top of the viewport. At the very bottom of the page
 * it is the last section, because short final sections can never scroll up
 * to the offset. `tops` maps a section id to its distance from the viewport top.
 */
export function activeSectionAt(
  tops: Readonly<Record<string, number | undefined>>,
  atBottom: boolean,
  offset: number = ACTIVE_SECTION_OFFSET,
): SettingsSectionId {
  if (atBottom) return SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id;
  let active: SettingsSectionId = SETTINGS_SECTIONS[0].id;
  for (const { id } of SETTINGS_SECTIONS) {
    const top = tops[id];
    if (top !== undefined && top <= offset) active = id;
  }
  return active;
}
