// `mofin://` links may only open a screen (detail, add form, an invitation, widget targets), never
// settings or delete or anything that writes. The signed-out guard is in the root layout.
export const HOME_PATH = '/';

const TRANSACTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const WIDGET_SCREENS = { dashboard: '/dashboard', goals: '/goals' } as const;
export type WidgetScreen = keyof typeof WIDGET_SCREENS;

const WIDGET_NAMES = ['WeeklySummary', 'MonthlySummary', 'Goals'];

export function widgetScreen(name: unknown): WidgetScreen {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(WIDGET_SCREENS, name) ? (name as WidgetScreen) : 'dashboard';
}

export const INVITATION_PATH = '/invitations';
const INVITE_TOKEN = /^[A-Za-z0-9_-]{16,256}$/;

export function inviteToken(path: string): string | undefined {
  const query = path.match(/\?([^#]*)/)?.[1] ?? '';
  const token = new URLSearchParams(query).get('token');
  return token && INVITE_TOKEN.test(token) ? token : undefined;
}

export function isTransactionId(id: unknown): id is string {
  return typeof id === 'string' && TRANSACTION_ID.test(id);
}

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
  // An emailed invitation, handed over by the web page. The token is kept by the caller, so it
  // survives a sign-in; opening the screen answers nothing, the person still has to tap.
  if (parts.length === 1 && parts[0] === 'invitations') return inviteToken(path) ? INVITATION_PATH : HOME_PATH;
  if (parts[0] === 'transactions') {
    if (parts.length === 2 && parts[1] === 'new') return '/transactions/new';
    if (parts.length === 2 && parts[1] !== 'edit' && TRANSACTION_ID.test(parts[1]!)) return `/transactions/${parts[1]}`;
  }
  return HOME_PATH;
}
