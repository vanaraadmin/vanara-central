import { accommodationImageFor } from "../config/accommodationImages";
import { requestJson } from "./api.client";
import type { RoomsWorkspaceOverview, RoomsWorkspaceResponse } from "../types/rooms-workspace";

export async function loadRoomsWorkspace(signal?: AbortSignal): Promise<RoomsWorkspaceOverview> {
  const response = await requestJson<RoomsWorkspaceResponse>("/api/rooms", signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Rooms workspace is unavailable");
  }

  return {
    ...response.data,
    rooms: response.data.rooms.map((room) => ({
      ...room,
      heroImage: accommodationImageFor(room.heroImageKey),
    })),
  };
}
