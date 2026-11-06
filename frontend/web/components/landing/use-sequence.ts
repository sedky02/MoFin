"use client";

import * as React from "react";

/**
 * Steps through stages 1…delays.length while `run` is true; with `skip` (reduced motion) it reports
 * the last stage at once. Pass a module-level array so it stays stable.
 */
export function useSequence(delays: readonly number[], run: boolean, skip: boolean) {
  const [stage, setStage] = React.useState(0);
  const [round, setRound] = React.useState(0);

  React.useEffect(() => {
    if (!run || skip) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 0;
    delays.forEach((delay, i) => {
      at += delay;
      timers.push(setTimeout(() => setStage(i + 1), at));
    });
    return () => timers.forEach(clearTimeout);
  }, [delays, run, skip, round]);

  function restart() {
    setStage(0);
    setRound((n) => n + 1);
  }

  return [skip && run ? delays.length : stage, restart] as const;
}

export function useTypewriter(text: string, start: boolean, skip: boolean, msPerChar = 32) {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!start || skip) return;
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= text.length) clearInterval(timer);
    }, msPerChar);
    return () => clearInterval(timer);
  }, [text, start, skip, msPerChar]);

  if (skip) return text;
  return start ? text.slice(0, count) : "";
}
