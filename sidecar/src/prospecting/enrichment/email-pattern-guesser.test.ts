import { describe, expect, it } from "vitest";
import { guessEmailPatterns } from "./email-pattern-guesser.js";

describe("email pattern guesser", () => {
  it("prioritizes India-friendly email patterns and uses known examples first", () => {
    expect(
      guessEmailPatterns({
        fullName: "Priya Sharma",
        domain: "setu.co",
        examples: ["divya.mehta@setu.co", "aman@setu.co"],
      }),
    ).toEqual([
      { email: "priya.sharma@setu.co", pattern: "first.last", confidence: 0.86 },
      { email: "priya@setu.co", pattern: "first", confidence: 0.82 },
      { email: "p.sharma@setu.co", pattern: "f.last", confidence: 0.72 },
      { email: "priyas@setu.co", pattern: "firstl", confidence: 0.64 },
    ]);
  });
});
