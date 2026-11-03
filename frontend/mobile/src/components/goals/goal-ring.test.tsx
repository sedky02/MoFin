import { render, screen } from '@testing-library/react-native';

import { GoalRing } from './goal-ring';

describe('GoalRing', () => {
  it('announces the progress and the percent', async () => {
    await render(<GoalRing ratio={42.4} percent={42} tone="on-track" />);
    const ring = screen.getByRole('progressbar');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42, text: '42%' });
    expect(screen.getByText('42%')).toBeTruthy();
  });

  it('says when an expense goal is over its target', async () => {
    await render(<GoalRing ratio={100} percent={100} tone="failed" overTarget />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.text).toBe('100%, over target');
  });
});
