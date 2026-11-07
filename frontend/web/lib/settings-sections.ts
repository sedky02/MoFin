export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "preferences", label: "Preferences" },
  { id: "security", label: "Security" },
  { id: "connected-apps", label: "Connected AI apps" },
  { id: "ai-provider", label: "AI provider" },
  { id: "data", label: "Data" },
  { id: "delete-account", label: "Delete account" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/**
 * How far below the viewport top a section must have scrolled to count as the one being read:
 * clears the sticky top bar and mobile section row.
 */
export const ACTIVE_SECTION_OFFSET = 140;

/**
 * The last section whose top has reached `offset`; at the very bottom of the page it is the last
 * section, since short sections can never reach it.
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
