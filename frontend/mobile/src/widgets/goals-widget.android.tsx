import { Box, Button, CircularProgressIndicator, Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, padding, size, width } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { GoalsWidgetProps } from '@/widgets/goals-data';

// One focus goal with a ring, its name and a plain status, and the other goals (up to two) as pills.
// Same runtime rules as summary-widgets.android.tsx (Glance: padding, size, fill and background
// only): header on top, the ring block centred in the middle, pills and the update time at the bottom.
function GoalsWidget(props: GoalsWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { card: '#131313', text: '#e5e2e1', muted: '#8e9192', dot: '#d2f000', track: '#2a2a2a', chip: '#1f1f1f' }
    : { card: '#ffffff', text: '#131313', muted: '#686b68', dot: '#b8d000', track: '#ecece8', chip: '#f3f3ee' };
  const tone = dark
    ? { good: '#d2f000', behind: '#f59e0b', over: '#ff5c5c', done: '#c8e600' }
    : { good: '#9db300', behind: '#b45309', over: '#b91c1c', done: '#4a5a00' };
  const link = (url: string) => ({ url }) as object;

  const focus = props.focus;
  return (
    <Button {...link(props.openUrl)} modifiers={[fillMaxSize(), background(c.card), cornerRadius(24)]}>
      <Box modifiers={[fillMaxSize()]}>
        <Box modifiers={[fillMaxSize()]} contentAlignment="topStart">
          {/* The right padding keeps the summary clear of the refresh arrow. */}
          <Row verticalAlignment="center" modifiers={[padding(16, 14, 34, 0)]}>
            <Box modifiers={[size(8, 8), background(c.dot), cornerRadius(4)]} />
            <Spacer modifiers={[width(7)]} />
            <Text color={c.text} style={{ fontSize: 13, fontWeight: 'bold' }} maxLines={1}>
              Goals
            </Text>
            <Spacer modifiers={[width(7)]} />
            {/* A note ("Updating…", "A goal ended or was removed") replaces the summary. */}
            <Text color={props.note ? c.text : c.muted} style={{ fontSize: 13 }} maxLines={1}>
              {props.note || props.summary}
            </Text>
          </Row>
        </Box>
        {props.kind === 'message' || !focus ? (
          <Box modifiers={[fillMaxSize()]} contentAlignment="centerStart">
            <Text color={c.text} style={{ fontSize: 15 }} maxLines={3} modifiers={[padding(16, 24, 16, 8)]}>
              {props.message}
            </Text>
          </Box>
        ) : (
          <Box modifiers={[fillMaxSize()]} contentAlignment="centerStart">
            {/* Padded top and bottom by what the header and the pills take, so it centres in the rest. */}
            <Row verticalAlignment="center" modifiers={[padding(16, 34, 16, 52)]}>
              <Box modifiers={[size(76, 76)]} contentAlignment="center">
                <CircularProgressIndicator
                  progress={focus.progress}
                  color={tone[focus.tone]}
                  trackColor={c.track}
                  modifiers={[size(76, 76)]}
                />
                <Text color={c.text} style={{ fontSize: 16 }} maxLines={1}>
                  {focus.percent}
                </Text>
              </Box>
              <Spacer modifiers={[width(12)]} />
              <Column>
                <Text color={c.text} style={{ fontSize: 14 }} maxLines={3}>
                  {focus.name}
                </Text>
                <Text color={tone[focus.tone]} style={{ fontSize: 11, fontWeight: 'bold' }} maxLines={1}>
                  {focus.status}
                </Text>
              </Column>
            </Row>
          </Box>
        )}
        {props.kind === 'data' ? (
          <Box modifiers={[fillMaxSize()]} contentAlignment="bottomStart">
            <Column modifiers={[padding(16, 0, 16, 12)]}>
              {props.others.length ? (
                <Row>
                  {props.others.map((goal, i) => (
                    <Row key={`${i}`} verticalAlignment="center" modifiers={[background(c.chip), cornerRadius(10), padding(8, 5, 8, 5)]}>
                      <Text color={c.muted} style={{ fontSize: 11 }} maxLines={1}>
                        {goal.name}
                      </Text>
                      <Spacer modifiers={[width(6)]} />
                      <Text color={c.text} style={{ fontSize: 11, fontWeight: 'bold' }} maxLines={1}>
                        {goal.percent}
                      </Text>
                      {i < props.others.length - 1 ? <Spacer modifiers={[width(8)]} /> : null}
                    </Row>
                  ))}
                </Row>
              ) : null}
              <Text color={c.muted} style={{ fontSize: 10 }} maxLines={1} modifiers={[padding(0, 6, 0, 0)]}>
                {props.updated}
              </Text>
            </Column>
          </Box>
        ) : null}
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
  summary: '',
  focus: null,
  others: [],
  updated: '',
  note: '',
  message: 'Open MoFin to load your goals.',
  openUrl: 'mofin://goals',
  refreshUrl: 'mofin://refresh?to=goals',
});
