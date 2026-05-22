export type EmailPatternGuessInput = {
  fullName: string;
  domain: string;
  examples?: string[];
};

export type EmailPatternGuess = {
  email: string;
  pattern: string;
  confidence: number;
};

export function guessEmailPatterns(input: EmailPatternGuessInput): EmailPatternGuess[] {
  const [firstName, ...rest] = input.fullName.trim().toLowerCase().split(/\s+/);
  const lastName = rest.at(-1) ?? "";
  const domain = input.domain.toLowerCase().replace(/^www\./, "");
  const examplePatterns = new Set((input.examples ?? []).map((email) => inferPattern(email, domain)));
  const candidates: EmailPatternGuess[] = [
    { email: `${firstName}.${lastName}@${domain}`, pattern: "first.last", confidence: examplePatterns.has("first.last") ? 0.86 : 0.78 },
    { email: `${firstName}@${domain}`, pattern: "first", confidence: examplePatterns.has("first") ? 0.82 : 0.74 },
    { email: `${firstName[0]}.${lastName}@${domain}`, pattern: "f.last", confidence: 0.72 },
    { email: `${firstName}${lastName[0] ?? ""}@${domain}`, pattern: "firstl", confidence: 0.64 },
  ];
  return candidates.filter((candidate, index, array) =>
    candidate.email.includes("@") && array.findIndex((item) => item.email === candidate.email) === index
  );
}

function inferPattern(email: string, domain: string) {
  const local = email.toLowerCase().replace(`@${domain}`, "");
  if (/^[a-z]+\.[a-z]+$/.test(local)) {
    return "first.last";
  }
  if (/^[a-z]+$/.test(local)) {
    return "first";
  }
  if (/^[a-z]\.[a-z]+$/.test(local)) {
    return "f.last";
  }
  return "unknown";
}
