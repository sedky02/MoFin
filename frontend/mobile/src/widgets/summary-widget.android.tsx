import { Box, Button, Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, paddingAll, size, width } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { SummaryWidgetProps } from '@/widgets/summary-data';

// The Summary home screen widget (Android). It runs in the widget's own runtime, which only knows
// Expo UI's Compose components: no hooks, no imports of app code at runtime, nothing from outside
// this function (types are fine, they are erased). Every string arrives ready from the app
// (src/widgets/summary-data.ts); this only lays them out.
//
// Taps: the whole card opens the dashboard, the ↻ opens the app to refresh. Both are buttons with a
// `url`, which our expo-widgets patch turns into a deep link (patches/expo-widgets+*.patch).
function SummaryWidget(props: SummaryWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { card: '#131313', text: '#e5e2e1', muted: '#8e9192', income: '#c8e600', expense: '#ff5c5c', brand: '#d2f000' }
    : { card: '#ffffff', text: '#131313', muted: '#5c5f5c', income: '#5d6b00', expense: '#b91c1c', brand: '#4a5a00' };
  // The url prop comes from the patch; Expo UI's types don't list it yet.
  const link = (url: string) => ({ url }) as object;

  if (props.kind === 'message') {
    return (
      <Button {...link(props.openUrl)} modifiers={[fillMaxSize(), background(c.card), cornerRadius(20), paddingAll(16)]}>
        <Box modifiers={[fillMaxSize()]} contentAlignment="centerStart">
          <Column>
            <Text color={c.brand} style={{ fontSize: 15, fontWeight: 'bold' }}>
              MoFin
            </Text>
            <Spacer modifiers={[height(6)]} />
            <Text color={c.text} style={{ fontSize: 14 }} maxLines={3}>
              {props.message}
            </Text>
          </Column>
        </Box>
      </Button>
    );
  }

  return (
    <Button {...link(props.openUrl)} modifiers={[fillMaxSize(), background(c.card), cornerRadius(20), paddingAll(14)]}>
      <Column modifiers={[fillMaxSize()]}>
        <Row modifiers={[fillMaxWidth()]} verticalAlignment="center">
          <Text color={c.text} style={{ fontSize: 13, fontWeight: 'bold' }} maxLines={1}>
            {props.title}
          </Text>
          <Spacer modifiers={[width(6)]} />
          <Text color={c.muted} style={{ fontSize: 12 }} maxLines={1}>
            {props.scope}
          </Text>
        </Row>
        <Spacer modifiers={[height(4)]} />
        <Text color={c.muted} style={{ fontSize: 11 }}>
          Balance
        </Text>
        <Text color={c.text} style={{ fontSize: 22, fontWeight: 'bold' }} maxLines={1}>
          {props.balance}
        </Text>
        <Spacer modifiers={[height(6)]} />
        <Row modifiers={[fillMaxWidth()]}>
          <Column>
            <Text color={c.muted} style={{ fontSize: 11 }}>
              Income
            </Text>
            <Text color={c.income} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>
              {props.income}
            </Text>
          </Column>
          <Spacer modifiers={[width(18)]} />
          <Column>
            <Text color={c.muted} style={{ fontSize: 11 }}>
              Expenses
            </Text>
            <Text color={c.expense} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>
              {props.expenses}
            </Text>
          </Column>
        </Row>
        <Spacer modifiers={[height(6)]} />
        <Row modifiers={[fillMaxWidth()]} verticalAlignment="center">
          <Text color={props.note ? c.text : c.muted} style={{ fontSize: 11 }} maxLines={1}>
            {props.note ? `${props.note} · ${props.updated}` : props.updated}
          </Text>
          <Spacer modifiers={[width(4)]} />
          <Button {...link(props.refreshUrl)} modifiers={[size(32, 32), cornerRadius(16)]}>
            <Box modifiers={[size(32, 32)]} contentAlignment="center">
              <Text color={c.brand} style={{ fontSize: 16, fontWeight: 'bold' }}>
                ↻
              </Text>
            </Box>
          </Button>
        </Row>
      </Column>
    </Button>
  );
}

export default createWidget<SummaryWidgetProps>('Summary', SummaryWidget, {
  kind: 'message',
  title: '',
  scope: '',
  balance: '',
  income: '',
  expenses: '',
  updated: '',
  note: '',
  message: 'Open MoFin to load your summary.',
  openUrl: 'mofin://dashboard',
  refreshUrl: 'mofin://refresh?to=dashboard',
});
