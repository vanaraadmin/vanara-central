import {
  notifyGuestMessageDraftReady as emitGuestMessageDraftReady,
  notifyGuestMessageInbound as emitGuestMessageInbound,
  type NotificationBindings,
} from "./notifications.service.js";

export type GuestMessageNotificationBindings = NotificationBindings;

export async function notifyGuestMessageInbound(env: GuestMessageNotificationBindings, input: {
  messageId: number | string;
  conversationId: number | string;
}): Promise<void> {
  await emitGuestMessageInbound(env, input);
}

export async function notifyGuestMessageDraftReady(env: GuestMessageNotificationBindings, input: {
  messageId: number | string;
  draftId: number | string;
  conversationId: number | string;
}): Promise<void> {
  await emitGuestMessageDraftReady(env, input);
}
