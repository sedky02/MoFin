import { Box, Button, Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, height, paddingAll, size, width } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { SummaryWidgetProps } from '@/widgets/summary-data';

// The "This week" and "This month" widgets share one layout. They run in the widget's own runtime
// (Expo UI Compose components only): no hooks or app code; strings come from summary-data.ts.
function SummaryWidget(props: SummaryWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { card: '#131313', text: '#e5e2e1', muted: '#8e9192', income: '#c8e600', dot: '#d2f000' }
    : { card: '#ffffff', text: '#131313', muted: '#686b68', income: '#4a5a00', dot: '#b8d000' };
  // The url prop comes from the patch; Expo UI's types don't list it yet.
  const link = (url: string) => ({ url }) as object;

  const header = (
    <Row verticalAlignment="center">
      <Box modifiers={[size(8, 8), background(c.dot), cornerRadius(4)]} />
      <Spacer modifiers={[width(8)]} />
      <Text color={c.text} style={{ fontSize: 13, fontWeight: 'bold' }} maxLines={1}>
        {props.title}
      </Text>
      {props.scope ? (
        <Text color={c.muted} style={{ fontSize: 13 }} maxLines={1}>
          {`  ${props.scope}`}
        </Text>
      ) : null}
    </Row>
  );

  return (
    <Button {...link(props.openUrl)} modifiers={[fillMaxSize(), background(c.card), cornerRadius(24)]}>
      <Box modifiers={[fillMaxSize()]}>
        {props.kind === 'message' ? (
          <Column modifiers={[fillMaxSize(), paddingAll(16)]}>
            {header}
            <Spacer modifiers={[height(12)]} />
            <Text color={c.text} style={{ fontSize: 15 }} maxLines={3}>
              {props.message}
            </Text>
          </Column>
        ) : (
          <Column modifiers={[fillMaxSize(), paddingAll(16)]}>
            {header}
            <Spacer modifiers={[height(12)]} />
            <Text color={c.text} style={{ fontSize: 30 }} maxLines={1}>
              {props.balance}
            </Text>
            <Text color={c.muted} style={{ fontSize: 12 }}>
              Balance
            </Text>
            <Spacer modifiers={[height(12)]} />
            <Row>
              <Column>
                <Text color={c.muted} style={{ fontSize: 12 }}>
                  In
                </Text>
                <Text color={c.income} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>
                  {props.income}
                </Text>
              </Column>
              <Spacer modifiers={[width(24)]} />
              <Column>
                <Text color={c.muted} style={{ fontSize: 12 }}>
                  Out
                </Text>
                <Text color={c.text} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>
                  {props.expenses}
                </Text>
              </Column>
            </Row>
            <Spacer modifiers={[height(10)]} />
            <Text color={props.note ? c.text : c.muted} style={{ fontSize: 11 }} maxLines={1}>
              {props.note ? `${props.note} · ${props.updated}` : props.updated}
            </Text>
          </Column>
        )}
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
