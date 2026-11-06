import { Box, Button, Column, LinearProgressIndicator, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { GoalsWidgetProps } from '@/widgets/goals-data';

// Up to three goals picked when it was added: name, percentage and a thin bar. Same runtime rules
// as summary-widgets.android.tsx; the card opens Goals, ↻ opens the app to refresh.
function GoalsWidget(props: GoalsWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { card: '#131313', text: '#e5e2e1', muted: '#8e9192', dot: '#d2f000', track: '#2a2a2a' }
    : { card: '#ffffff', text: '#131313', muted: '#686b68', dot: '#b8d000', track: '#ecece8' };
  const bar = dark
    ? { good: '#d2f000', behind: '#f59e0b', over: '#ff5c5c', done: '#c8e600' }
    : { good: '#9db300', behind: '#b45309', over: '#b91c1c', done: '#4a5a00' };
  const link = (url: string) => ({ url }) as object;

  return (
    <Button {...link(props.openUrl)} modifiers={[fillMaxSize(), background(c.card), cornerRadius(24)]}>
      <Box modifiers={[fillMaxSize()]}>
        <Column modifiers={[fillMaxSize(), paddingAll(16)]}>
          <Row verticalAlignment="center">
            <Box modifiers={[size(8, 8), background(c.dot), cornerRadius(4)]} />
            <Spacer modifiers={[width(8)]} />
            <Text color={c.text} style={{ fontSize: 13, fontWeight: 'bold' }}>
              Goals
            </Text>
          </Row>
          <Spacer modifiers={[height(12)]} />
          {props.kind === 'message' ? (
            <Text color={c.text} style={{ fontSize: 15 }} maxLines={3}>
              {props.message}
            </Text>
          ) : (
            <Column modifiers={[fillMaxWidth()]}>
              {props.rows.map((row, i) => (
                <Column key={`${i}`} modifiers={[fillMaxWidth()]}>
                  {i > 0 ? <Spacer modifiers={[height(12)]} /> : null}
                  {/* The name, with the percentage held to the right over it. */}
                  <Box modifiers={[fillMaxWidth()]}>
                    <Text color={c.text} style={{ fontSize: 14 }} maxLines={1} modifiers={[padding(0, 0, 52, 0)]}>
                      {row.name}
                    </Text>
                    <Box modifiers={[fillMaxWidth()]} contentAlignment="centerEnd">
                      <Text color={c.muted} style={{ fontSize: 13 }}>
                        {row.percent}
                      </Text>
                    </Box>
                  </Box>
                  <Spacer modifiers={[height(6)]} />
                  <LinearProgressIndicator
                    progress={row.progress}
                    color={bar[row.tone]}
                    trackColor={c.track}
                    modifiers={[fillMaxWidth(), height(6), cornerRadius(3)]}
                  />
                </Column>
              ))}
              <Spacer modifiers={[height(12)]} />
              <Text color={props.note ? c.text : c.muted} style={{ fontSize: 11 }} maxLines={1}>
                {props.note ? `${props.note} · ${props.updated}` : props.updated}
              </Text>
            </Column>
          )}
        </Column>
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

export const GoalsHomeWidget = createWidget<GoalsWidgetProps>('Goals', GoalsWidget, {
  kind: 'message',
  rows: [],
  updated: '',
  note: '',
  message: 'Open MoFin to load your goals.',
  openUrl: 'mofin://goals',
  refreshUrl: 'mofin://refresh?to=goals',
});
