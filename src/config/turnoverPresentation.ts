import type { RoomDetail } from "../types/room-detail";
import type { RoomDomainTone, RoomsWorkspaceRoom } from "../types/rooms-workspace";

export type TurnoverState =
  | "GUEST_IN_HOUSE"
  | "WAITING_FOR_TODAYS_CHECKOUT"
  | "TODAYS_CHECKOUT_COMPLETED"
  | "WAITING_FOR_TODAYS_CHECKIN"
  | "GUEST_CHECKED_IN";

export interface TurnoverPresentation {
  state: TurnoverState;
  label: string;
  detail: string;
  tone: RoomDomainTone;
}

function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function sameDate(left: string | null | undefined, right: string): boolean {
  return left === right;
}

function stateCopy(state: TurnoverState): Pick<TurnoverPresentation, "detail" | "label" | "tone"> {
  if (state === "GUEST_IN_HOUSE") {
    return {
      label: "Guest In House",
      detail: "Guest is still in the room.",
      tone: "success",
    };
  }

  if (state === "WAITING_FOR_TODAYS_CHECKOUT") {
    return {
      label: "Waiting for Today's Check-out",
      detail: "Guest has not completed today's check-out.",
      tone: "warning",
    };
  }

  if (state === "TODAYS_CHECKOUT_COMPLETED") {
    return {
      label: "Today's Check-out Completed",
      detail: "Room released. Waiting for today's check-in.",
      tone: "warning",
    };
  }

  if (state === "WAITING_FOR_TODAYS_CHECKIN") {
    return {
      label: "Waiting for Today's Check-in",
      detail: "Room is waiting for today's check-in.",
      tone: "neutral",
    };
  }

  return {
    label: "Guest Checked-in",
    detail: "Today's check-in is complete.",
    tone: "success",
  };
}

function buildPresentation(state: TurnoverState): TurnoverPresentation {
  return {
    ...stateCopy(state),
    state,
  };
}

export function getRoomsWorkspaceTurnover(room: RoomsWorkspaceRoom, date = todayBangkok()): TurnoverPresentation {
  if (room.reception.phase === "DEPARTURE_DUE") return buildPresentation("WAITING_FOR_TODAYS_CHECKOUT");
  if (room.reception.phase === "CHECKED_OUT") return buildPresentation("TODAYS_CHECKOUT_COMPLETED");
  if (room.reception.phase === "ARRIVAL_DUE") return buildPresentation("WAITING_FOR_TODAYS_CHECKIN");
  if (room.currentStay && sameDate(room.currentStay.arrivalDate, date)) return buildPresentation("GUEST_CHECKED_IN");
  if (room.currentStay && room.operational.occupancy.state === "OCCUPIED") return buildPresentation("GUEST_IN_HOUSE");
  return buildPresentation("WAITING_FOR_TODAYS_CHECKIN");
}

export function getRoomDetailTurnover(room: RoomDetail, date = todayBangkok()): TurnoverPresentation {
  if (sameDate(room.departure, date) && room.checkoutCompleted) return buildPresentation("TODAYS_CHECKOUT_COMPLETED");
  if (sameDate(room.departure, date)) return buildPresentation("WAITING_FOR_TODAYS_CHECKOUT");
  if (sameDate(room.arrival, date) && !room.currentStay) return buildPresentation("WAITING_FOR_TODAYS_CHECKIN");
  if (room.currentStay && sameDate(room.currentStay.arrival, date) && room.occupancyStatus === "Occupied") return buildPresentation("GUEST_CHECKED_IN");
  if (room.currentStay && room.occupancyStatus === "Occupied") return buildPresentation("GUEST_IN_HOUSE");
  return buildPresentation("WAITING_FOR_TODAYS_CHECKIN");
}
