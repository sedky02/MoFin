import { describe, expect, it } from "vitest";
import {
  ANSWERED,
  CARD,
  SENT,
  THINKING,
  TOOL_CALL,
  TYPING,
  chatFrame,
  marksFromDelays,
  stageAtMarks,
  typedBetween,
} from "./chat-progress";

const QUESTION = "How much did I spend on food this month?";
const ANSWER = "$612.40 on food so far in October, 12% less than September.";

describe("chatFrame", () => {
  it("steps through the stages as the scroll goes on", () => {
    const stageAt = (q: number) => chatFrame(q, QUESTION, ANSWER).stage;
    expect([0, 0.1, 0.26, 0.35, 0.45, 0.6, 0.9].map(stageAt)).toEqual([0, TYPING, SENT, THINKING, TOOL_CALL, ANSWERED, CARD]);
  });

  it("types the question out while it is being typed, and only then", () => {
    expect(chatFrame(0.01, QUESTION, ANSWER).typed).toBe("");
    const mid = chatFrame(0.13, QUESTION, ANSWER).typed;
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.length).toBeLessThan(QUESTION.length);
    expect(QUESTION.startsWith(mid)).toBe(true);
    expect(chatFrame(0.3, QUESTION, ANSWER).typed).toBe("");
  });

  it("writes the answer out as the scroll goes on, whole by the time the card shows", () => {
    expect(chatFrame(0.45, QUESTION, ANSWER).answer).toBe("");
    const mid = chatFrame(0.66, QUESTION, ANSWER).answer;
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.length).toBeLessThan(ANSWER.length);
    expect(chatFrame(0.84, QUESTION, ANSWER).answer).toBe(ANSWER);
    expect(chatFrame(1, QUESTION, ANSWER).answer).toBe(ANSWER);
  });

  it("rewinds: the same progress always gives the same frame", () => {
    const forward = chatFrame(0.6, QUESTION, ANSWER);
    chatFrame(0.95, QUESTION, ANSWER);
    expect(chatFrame(0.6, QUESTION, ANSWER)).toEqual(forward);
  });
});

describe("marksFromDelays", () => {
  it("spreads the stages over 0-1 in proportion to their delays, ending at 1", () => {
    expect(marksFromDelays([100, 300, 600])).toEqual([0.1, 0.4, 1]);
  });
});

describe("stageAtMarks", () => {
  const marks = [0.1, 0.4, 1];
  it("counts the marks passed", () => {
    expect([0, 0.09, 0.1, 0.39, 0.4, 0.99, 1].map((p) => stageAtMarks(p, marks))).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
});

describe("typedBetween", () => {
  it("is empty before, partial between and whole after", () => {
    expect(typedBetween("hello", 0.1, 0.2, 0.6)).toBe("");
    expect(typedBetween("hello", 0.4, 0.2, 0.6)).toBe("hel");
    expect(typedBetween("hello", 0.6, 0.2, 0.6)).toBe("hello");
    expect(typedBetween("hello", 0.9, 0.2, 0.6)).toBe("hello");
  });
});
