import type { RoomDetail } from "../types/room-detail";
import type { RoomDomainTone, RoomsWorkspaceRoom } from "../types/rooms-workspace";

export type TurnoverState =
  | "WAITING_FOR_TODAYS_CHECKOUT"
  | "TODAYS_CHECKOUT_COMPLETED"
  | "WAITING_FOR_TODAYS_CHECKIN"
  | "GUEST_WAITING_FOR_ROOM"
  | "READY_FOR_TODAYS_CHECKIN";


export type TurnoverWorkKind = "PRIORITY_TURNOVER" | "CHECKOUT_CLEANING";
export interface TurnoverPresentation {
  state: TurnoverState;
  label: string;
  workKind: TurnoverWorkKind;
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

function buildPresentation(state: TurnoverState, workKind: TurnoverWorkKind): TurnoverPresentation {
  return {
    ...stateCopy(state),
    state,
    workKind,
  };
}

function roomWorkspaceTurnoverInProgress(room: RoomsWorkspaceRoom): boolean {
  return ["Priority Turnover", "Check-out Cleaning"].includes(room.housekeeping.activeTask?.taskType ?? "") && room.housekeeping.activeTask?.status === "IN_PROGRESS";
}

function roomWorkspaceHasActiveTurnover(room: RoomsWorkspaceRoom): boolean {
  return ["Priority Turnover", "Check-out Cleaning"].includes(room.housekeeping.activeTask?.taskType ?? "");
}

function roomWorkspaceWorkKind(room: RoomsWorkspaceRoom): TurnoverWorkKind {
  return room.reception.today.checkIn || room.housekeeping.activeTask?.taskType === "Priority Turnover" ? "PRIORITY_TURNOVER" : "CHECKOUT_CLEANING";
}

export function getRoomsWorkspaceTurnover(room: RoomsWorkspaceRoom, date = todayBangkok()): TurnoverPresentation | null {
  if (roomWorkspaceTurnoverInProgress(room) && room.reception.checkIn.state === "COMPLETE") return buildPresentation("GUEST_WAITING_FOR_ROOM", "PRIORITY_TURNOVER");
  if (room.reception.today.checkIn && room.currentStay && !roomWorkspaceTurnoverInProgress(room)) return null;
  const workKind = roomWorkspaceWorkKind(room);
  if (room.reception.phase === "DEPARTURE_DUE") return buildPresentation("WAITING_FOR_TODAYS_CHECKOUT", workKind);
  if (room.reception.phase === "CHECKED_OUT" && roomWorkspaceHasActiveTurnover(room)) return buildPresentation("TODAYS_CHECKOUT_COMPLETED", workKind);
  if (roomWorkspaceTurnoverInProgress(room)) return buildPresentation("TODAYS_CHECKOUT_COMPLETED", workKind);
  if (room.reception.phase === "ARRIVAL_DUE") {
    if (room.operational.housekeeping.condition === "READY" && room.operational.housekeeping.workState === "NONE") {
      return buildPresentation("READY_FOR_TODAYS_CHECKIN", "PRIORITY_TURNOVER");
    }
    return buildPresentation("WAITING_FOR_TODAYS_CHECKIN", "PRIORITY_TURNOVER");
  }
  if (room.reception.today.checkIn && !room.currentStay && room.operational.housekeeping.condition === "READY" && room.operational.housekeeping.workState === "NONE") {
    return buildPresentation("READY_FOR_TODAYS_CHECKIN", "PRIORITY_TURNOVER");
  }
  void date;
  return null;
}

function roomDetailTurnoverInProgress(room: RoomDetail): boolean {
  return ["PRIORITY_TURNOVER", "CHECKOUT_CLEANING"].includes(room.housekeeping.activeTask?.workKind ?? "") && room.housekeeping.activeTask?.status === "IN_PROGRESS";
}

function roomDetailHasActiveTurnover(room: RoomDetail): boolean {
  return ["PRIORITY_TURNOVER", "CHECKOUT_CLEANING"].includes(room.housekeeping.activeTask?.workKind ?? "");
}

function roomDetailWorkKind(room: RoomDetail): TurnoverWorkKind {
  return room.housekeeping.activeTask?.workKind === "PRIORITY_TURNOVER" ? "PRIORITY_TURNOVER" : "CHECKOUT_CLEANING";
}

export function getRoomDetailTurnover(room: RoomDetail, date = todayBangkok()): TurnoverPresentation | null {
  if (roomDetailTurnoverInProgress(room) && room.currentStay && sameDate(room.currentStay.arrival, date)) return buildPresentation("GUEST_WAITING_FOR_ROOM", "PRIORITY_TURNOVER");
  if (sameDate(room.departure, date) && room.checkoutCompleted && roomDetailHasActiveTurnover(room)) return buildPresentation("TODAYS_CHECKOUT_COMPLETED", roomDetailWorkKind(room));
  if (sameDate(room.departure, date)) return buildPresentation("WAITING_FOR_TODAYS_CHECKOUT", roomDetailWorkKind(room));
  if (roomDetailTurnoverInProgress(room)) return buildPresentation("TODAYS_CHECKOUT_COMPLETED", roomDetailWorkKind(room));
  if (sameDate(room.arrival, date) && !room.currentStay) {
    if (room.housekeeping.readyState === "READY" && room.housekeeping.tasks.length === 0) return buildPresentation("READY_FOR_TODAYS_CHECKIN", "PRIORITY_TURNOVER");
    return buildPresentation("WAITING_FOR_TODAYS_CHECKIN", "PRIORITY_TURNOVER");
  }
  return null;
}
