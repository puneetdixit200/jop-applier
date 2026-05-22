export type OutreachReplyRecord = {
  id: string;
  contactId: string;
  campaignId: string;
};

export type OutreachReplyDependencies = {
  findOutreachEmailByMessageId(messageId: string): Promise<OutreachReplyRecord | null>;
  markOutreachEmailReplied(emailId: string, repliedAt: string): Promise<void>;
  cancelPendingFollowUps(contactId: string, campaignId: string): Promise<void>;
};

export type InboundOutreachMessage = {
  inReplyTo: string | null;
  subject: string;
  receivedAt: Date;
};

export async function detectOutreachReply(
  dependencies: OutreachReplyDependencies,
  message: InboundOutreachMessage,
) {
  if (!message.inReplyTo) {
    return { matched: false, emailId: null };
  }
  const email = await dependencies.findOutreachEmailByMessageId(message.inReplyTo);
  if (!email) {
    return { matched: false, emailId: null };
  }

  await dependencies.markOutreachEmailReplied(email.id, message.receivedAt.toISOString());
  await dependencies.cancelPendingFollowUps(email.contactId, email.campaignId);
  return { matched: true, emailId: email.id };
}
