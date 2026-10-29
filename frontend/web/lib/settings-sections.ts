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
 * The section to highlight: the first one in page order that is on screen,
 * or the previous highlight when none is (between two sections), or the first.
 */
export function pickActiveSection(
  visible: ReadonlySet<string>,
  previous: SettingsSectionId | undefined,
): SettingsSectionId {
  return SETTINGS_SECTIONS.find((s) => visible.has(s.id))?.id ?? previous ?? SETTINGS_SECTIONS[0].id;
}
