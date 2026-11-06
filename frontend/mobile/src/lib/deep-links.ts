// Incoming `mofin://` links. They may only ever open a screen (the transaction detail, the add
// form, or the screens home screen widgets open): never a settings or delete screen, and never
// anything that writes on open. A widget's ↻ only reads (it refetches the widget data, then opens
// its screen). Adding a widget opens its setup screen, which only saves this phone's choice of
// what that widget shows, and only when the user taps Done. Everything else
// lands on the app's home route. The signed-out guard lives in the root layout (`Stack.Protected`):
// a signed-out user is sent to the sign-in screen and the app opens normally after signing in.
export const HOME_PATH = '/';

const TRANSACTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Screens a widget opens, by the name its links use. */
export const WIDGET_SCREENS = { dashboard: '/dashboard', goals: '/goals' } as const;
export type WidgetScreen = keyof typeof WIDGET_SCREENS;

/** The home screen widgets, by their names in app.config.ts (setup links name one). */
const WIDGET_NAMES = ['WeeklySummary', 'MonthlySummary', 'Goals'];

/** The screen a widget's ↻ returns to: one of WIDGET_SCREENS, else the dashboard. */
export function widgetScreen(name: unknown): WidgetScreen {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(WIDGET_SCREENS, name) ? (name as WidgetScreen) : 'dashboard';
}

/** True for an id that can safely go into an API path (screens reached by a typed or pasted URL). */
export function isTransactionId(id: unknown): id is string {
  return typeof id === 'string' && TRANSACTION_ID.test(id);
}

/** Maps a path from an incoming link to a screen the link may open. */
export function safeDeepLinkPath(path: string): string {
  let pathname = path;
  let query = '';
  try {
    // `mofin://transactions/abc` arrives as a full URL on some platforms and as a path on others.
    const afterScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    pathname = afterScheme.split(/[?#]/)[0] ?? '';
    query = afterScheme.match(/\?([^#]*)/)?.[1] ?? '';
  } catch {
    return HOME_PATH;
  }
  const parts = pathname.split('/').filter(Boolean);
  // Home screen widgets: the screen they show, or ↻ (refresh the widgets, then that screen).
  if (parts.length === 1 && Object.prototype.hasOwnProperty.call(WIDGET_SCREENS, parts[0]!)) return WIDGET_SCREENS[parts[0] as WidgetScreen];
  if (parts.length === 1 && parts[0] === 'refresh') {
    const to = new URLSearchParams(query).get('to');
    return `/widget-refresh?to=${widgetScreen(to)}`;
  }
  if (parts.length === 1 && parts[0] === 'widget-setup') {
    const widget = new URLSearchParams(query).get('widget') ?? '';
    return WIDGET_NAMES.includes(widget) ? `/widget-setup?widget=${widget}` : HOME_PATH;
  }
  if (parts[0] === 'transactions') {
    if (parts.length === 2 && parts[1] === 'new') return '/transactions/new';
    if (parts.length === 2 && parts[1] !== 'edit' && TRANSACTION_ID.test(parts[1]!)) return `/transactions/${parts[1]}`;
  }
  return HOME_PATH;
}
