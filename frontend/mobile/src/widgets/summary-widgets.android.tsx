import { Box, Button, Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, padding, size, width } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { SummaryWidgetProps } from '@/widgets/summary-data';

// The "This week" and "This month" widgets share one layout. They run in the widget's own runtime
// (Expo UI Compose components only, drawn with Android Glance): no hooks or app code; strings come
// from summary-data.ts. Glance only knows padding, size, fill and background modifiers, so the
// widget is three full-size layers (header on top, balance in the middle, chips at the bottom):
// each stays put and the space between them grows with the widget.
function SummaryWidget(props: SummaryWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { card: '#131313', text: '#e5e2e1', muted: '#8e9192', income: '#c8e600', dot: '#d2f000', chip: '#1f1f1f' }
    : { card: '#ffffff', text: '#131313', muted: '#686b68', income: '#4a5a00', dot: '#b8d000', chip: '#f3f3ee' };
  // The url prop comes from the patch; Expo UI's types don't list it yet.
  const link = (url: string) => ({ url }) as object;

  const chip = (label: string, value: string, valueColor: string) => (
    <Column modifiers={[background(c.chip), cornerRadius(12), padding(10, 7, 10, 7)]}>
      <Text color={c.muted} style={{ fontSize: 11 }}>
        {label}
      </Text>
      <Text color={valueColor} style={{ fontSize: 13, fontWeight: 'bold' }} maxLines={1}>
        {value}
      </Text>
    </Column>
  );

  return (
    <Button {...link(props.openUrl)} modifiers={[fillMaxSize(), background(c.card), cornerRadius(24)]}>
      <Box modifiers={[fillMaxSize()]}>
        <Box modifiers={[fillMaxSize()]} contentAlignment="topStart">
          {/* The right padding keeps the scope clear of the refresh arrow. */}
          <Row verticalAlignment="center" modifiers={[padding(16, 14, 34, 0)]}>
            <Box modifiers={[size(8, 8), background(c.dot), cornerRadius(4)]} />
            <Spacer modifiers={[width(7)]} />
            <Text color={c.text} style={{ fontSize: 13, fontWeight: 'bold' }} maxLines={1}>
              {props.title}
            </Text>
            <Spacer modifiers={[width(7)]} />
            <Text color={c.muted} style={{ fontSize: 13 }} maxLines={1}>
              {props.scope}
            </Text>
          </Row>
        </Box>
        {props.kind === 'message' ? (
          <Box modifiers={[fillMaxSize()]} contentAlignment="centerStart">
            <Text color={c.text} style={{ fontSize: 15 }} maxLines={3} modifiers={[padding(16, 24, 16, 8)]}>
              {props.message}
            </Text>
          </Box>
        ) : (
          <Box modifiers={[fillMaxSize()]} contentAlignment="centerStart">
            <Column modifiers={[padding(16, 24, 16, 24)]}>
              <Text color={c.text} style={{ fontSize: 30 }} maxLines={1}>
                {props.balance}
              </Text>
              {/* A note ("Updating…", "Couldn't update") replaces the word "Balance". */}
              <Text color={props.note ? c.text : c.muted} style={{ fontSize: 11 }} maxLines={1}>
                {`${props.note || 'Balance'} · ${props.updated}`}
              </Text>
            </Column>
          </Box>
        )}
        {props.kind === 'data' ? (
          <Box modifiers={[fillMaxSize()]} contentAlignment="bottomStart">
            <Row modifiers={[padding(16, 0, 16, 14)]}>
              {chip('In', props.income, c.income)}
              <Spacer modifiers={[width(8)]} />
              {chip('Out', props.expenses, c.text)}
            </Row>
          </Box>
        ) : null}
        {/* ↻ in the top right corner, over the card. */}
        <Box modifiers={[fillMaxSize()]} contentAlignment="topEnd">
          <Button {...link(props.refreshUrl)} modifiers={[size(48, 48), cornerRadius(24)]}>
            <Box modifiers={[size(48, 48)]} contentAlignment="center">
              <Text color={c.muted} style={{ fontSize: 17 }}>
                ↻
              </Text>
            </Box>
          </Button>
        </Box>
      </Box>
    </Button>
  );
}

// Shown before the app has pushed anything (the app replaces it on its next update).
export const WeeklySummaryWidget = createWidget<SummaryWidgetProps>('WeeklySummary', SummaryWidget, {
  kind: 'message',
  title: 'This week',
  scope: '',
  balance: '',
  income: '',
  expenses: '',
  updated: '',
  note: '',
  message: 'Open MoFin to load this week.',
  openUrl: 'mofin://dashboard',
  refreshUrl: 'mofin://refresh?to=dashboard',
});

export const MonthlySummaryWidget = createWidget<SummaryWidgetProps>('MonthlySummary', SummaryWidget, {
  kind: 'message',
  title: 'This month',
  scope: '',
  balance: '',
  income: '',
  expenses: '',
  updated: '',
  note: '',
  message: 'Open MoFin to load this month.',
  openUrl: 'mofin://dashboard',
  refreshUrl: 'mofin://refresh?to=dashboard',
});
