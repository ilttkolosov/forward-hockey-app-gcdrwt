import * as Crypto from "expo-crypto";
import { messengerRequest } from "./messengerApi";

export const MESSENGER_REPORT_REASONS = [
  "harassment",
  "hate_speech",
  "sexual_content",
  "violence",
  "spam",
  "impersonation",
  "privacy",
  "minor_safety",
  "other",
] as const;

export type MessengerReportReason =
  (typeof MESSENGER_REPORT_REASONS)[number];

export const MESSENGER_REPORT_REASON_LABELS: Record<
  MessengerReportReason,
  string
> = {
  harassment: "Оскорбления или травля",
  hate_speech: "Разжигание ненависти",
  sexual_content: "Материалы сексуального характера",
  violence: "Насилие или угрозы",
  spam: "Спам или мошенничество",
  impersonation: "Выдаёт себя за другого",
  privacy: "Нарушение приватности",
  minor_safety: "Безопасность несовершеннолетнего",
  other: "Другое нарушение",
};

export interface MessengerUserSafetyState {
  user_id: string;
  blocked_by_me: boolean;
}

export interface MessengerBlockedUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  blocked_at: string;
}

export interface MessengerSubmittedReport {
  id: string;
  reported_user: {
    id: string;
    display_name: string;
  };
  reason: MessengerReportReason;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
}

export function getMessengerUserSafetyState(userId: string) {
  return messengerRequest<MessengerUserSafetyState>(
    `/moderation/users/${encodeURIComponent(userId)}`,
  );
}

export function getMessengerBlockedUsers() {
  return messengerRequest<MessengerBlockedUser[]>("/moderation/blocks");
}

export function blockMessengerUser(userId: string) {
  return messengerRequest<MessengerUserSafetyState>(
    `/moderation/blocks/${encodeURIComponent(userId)}`,
    { method: "PUT" },
  );
}

export function unblockMessengerUser(userId: string) {
  return messengerRequest<MessengerUserSafetyState>(
    `/moderation/blocks/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export function reportMessengerUser(payload: {
  reportedUserId: string;
  reason: MessengerReportReason;
  details?: string;
  roomId?: string;
  messageId?: string;
}) {
  return messengerRequest<MessengerSubmittedReport>("/moderation/reports", {
    method: "POST",
    body: JSON.stringify({
      client_report_id: Crypto.randomUUID(),
      reported_user_id: payload.reportedUserId,
      room_id: payload.roomId || undefined,
      message_id: payload.messageId || undefined,
      reason: payload.reason,
      details: payload.details?.trim() || undefined,
    }),
  });
}
