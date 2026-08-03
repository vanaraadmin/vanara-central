import type { RoomDetail } from "../types/room-detail";
import type { RoomDomainTone, RoomsWorkspaceRoom } from "../types/rooms-workspace";

export type TurnoverState =
  | "WAITING_FOR_TODAYS_CHECKOUT"
  | "TODAYS_CHECKOUT_COMPLETED"
  | "WAITING_FOR_TODAYS_CHECKIN"
  | "GUEST_WAITING_FOR_ROOM"
  | "READY_FOR_TODAYS_CHECKIN";

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

  if (state === "GUEST_WAITING_FOR_ROOM") {
    return {
      label: "Guest Waiting For Room",
      detail: "Guest has checked in. Room is not ready yet.",
      tone: "danger",
    };
  }

  return {
    label: "Ready for Today's Check-in",
    detail: "Room is ready for today's check-in.",
    tone: "success",
  };
}

function buildPresentation(state: TurnoverState): TurnoverPresentation {
  return {
    ...stateCopy(state),
    state,
  };
}

function roomWorkspaceTurnoverInProgress(room: RoomsWorkspaceRoom): boolean {
  return room.housekeeping.activeTask?.taskType === "Turnover" && room.housekeeping.activeTask.status === "IN_PROGRESS";
}

function roomWorkspaceHasActiveTurnover(room: RoomsWorkspaceRoom): boolean {
  return room.housekeeping.activeTask?.taskType === "Turnover";
}

export function getRoomsWorkspaceTurnover(room: RoomsWorkspaceRoom, date = todayBangkok()): TurnoverPresentation | null {
  if (roomWorkspaceTurnoverInProgress(room) && room.reception.checkIn.state === "COMPLETE") return buildPresentation("GUEST_WAITING_FOR_ROOM");
  if (room.reception.today.checkIn && room.currentStay && !roomWorkspaceTurnoverInProgress(room)) return null;
  if (room.reception.phase === "DEPARTURE_DUE") return buildPresentation("WAITING_FOR_TODAYS_CHECKOUT");
  if (room.reception.phase === "CHECKED_OUT" && roomWorkspaceHasActiveTurnover(room)) return buildPresentation("TODAYS_CHECKOUT_COMPLETED");
  if (roomWorkspaceTurnoverInProgress(room)) return buildPresentation("TODAYS_CHECKOUT_COMPLETED");
  if (room.reception.phase === "ARRIVAL_DUE") {
    if (room.operational.housekeeping.condition === "READY" && room.operational.housekeeping.workState === "NONE") {
      return buildPresentation("READY_FOR_TODAYS_CHECKIN");
    }
    return buildPresentation("WAITING_FOR_TODAYS_CHECKIN");
  }
  if (room.reception.today.checkIn && !room.currentStay && room.operational.housekeeping.condition === "READY" && room.operational.housekeeping.workState === "NONE") {
    return buildPresentation("READY_FOR_TODAYS_CHECKIN");
  }
  void date;
  return null;
}

function roomDetailTurnoverInProgress(room: RoomDetail): boolean {
  return room.housekeeping.activeTask?.taskType === "TURNOVER" && room.housekeeping.activeTask.status === "IN_PROGRESS";
}

function roomDetailHasActiveTurnover(room: RoomDetail): boolean {
  return room.housekeeping.activeTask?.taskType === "TURNOVER";
}

export function getRoomDetailTurnover(room: RoomDetail, date = todayBangkok()): TurnoverPresentation | null {
  if (roomDetailTurnoverInProgress(room) && room.currentStay && sameDate(room.currentStay.arrival, date)) return buildPresentation("GUEST_WAITING_FOR_ROOM");
  if (sameDate(room.departure, date) && room.checkoutCompleted && roomDetailHasActiveTurnover(room)) return buildPresentation("TODAYS_CHECKOUT_COMPLETED");
  if (sameDate(room.departure, date)) return buildPresentation("WAITING_FOR_TODAYS_CHECKOUT");
  if (roomDetailTurnoverInProgress(room)) return buildPresentation("TODAYS_CHECKOUT_COMPLETED");
  if (sameDate(room.arrival, date) && !room.currentStay) {
    if (room.housekeeping.readyState === "READY" && room.housekeeping.tasks.length === 0) return buildPresentation("READY_FOR_TODAYS_CHECKIN");
    return buildPresentation("WAITING_FOR_TODAYS_CHECKIN");
  }
  return null;
}
