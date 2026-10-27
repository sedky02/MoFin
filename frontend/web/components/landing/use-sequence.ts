"use client";

import * as React from "react";

/**
 * Steps through stages 1…delays.length while `run` is true, waiting
 * `delays[i]` ms before entering stage i + 1. With `skip` (reduced motion) it
 * reports the last stage straight away. `restart` plays it again from 0.
 * Pass a module-level array so its identity is stable.
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

/** Types `text` out one character at a time once `start` is true; whole at once with `skip`. */
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
