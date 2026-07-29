import { requestJson } from "./api.client";
import type { RoomDetail, RoomDetailResponse } from "../types/room-detail";

export async function loadRoomDetail(roomId: string, signal?: AbortSignal): Promise<RoomDetail> {
  const response = await requestJson<RoomDetailResponse>(`/api/rooms/${encodeURIComponent(roomId)}`, signal);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Room detail is unavailable");
  }

  return response.data;
}