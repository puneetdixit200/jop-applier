export type UnsubscribeDependencies = {
  recordEmailOptOut(email: string, optedOutAt: string, reason: "unsubscribe_link"): Promise<void>;
  cancelPendingEmails(email: string): Promise<void>;
};

export function createUnsubscribeToken(email: string) {
  return Buffer.from(email.trim().toLowerCase()).toString("base64url");
}

export async function handleUnsubscribeToken(
  dependencies: UnsubscribeDependencies,
  token: string,
  now: Date,
) {
  const email = Buffer.from(token, "base64url").toString("utf8").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("invalid unsubscribe token");
  }
  const optedOutAt = now.toISOString();
  await dependencies.recordEmailOptOut(email, optedOutAt, "unsubscribe_link");
  await dependencies.cancelPendingEmails(email);
  return { email, optedOut: true };
}
