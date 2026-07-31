import type { MaintenanceCategory, MaintenancePriority, MaintenanceTicketDetail } from "./maintenance";

export type RoomHousekeepingStatus = "Dirty" | "Cleaning" | "Ready";
export type CheckoutCompletionSource = "reception" | "automatic-fallback" | "none";
export type RoomTimelineType = "check-in" | "check-out" | "housekeeping" | "maintenance" | "note" | "procurement";

export interface RoomCurrentStay {
  bookingId: number;
  beds24BookingId: number;
  guestName: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  guests: number;
  bookingSource: string;
  bookingReference: string | null;
}

export interface RoomHousekeeping {
  status: RoomHousekeepingStatus;
  assignedTo: string | null;
  assignedAt: string | null;
  lastUpdated: string | null;
  checklistAvailable: boolean;
  checklistLabel: string;
  checklistCompleted: number;
  checklistTotal: number;
  notes: string | null;
}

export interface RoomNote {
  id: number;
  unitId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceptionRoomAlert {
  id: number;
  bookingId: number;
  unitId: number;
  type: "passport_missing" | "deposit_pending";
  title: string;
  actionLabel: string;
  createdAt: string;
}

export interface RoomTimelineEvent {
  id: string;
  type: RoomTimelineType;
  title: string;
  description: string | null;
  actorName: string | null;
  occurredAt: string;
  sourceId: string | null;
}

export interface RoomChatContext {
  contextType: "room";
  contextId: string;
  roomName: string;
  accommodationType: string;
  conversationId: string | null;
  readyForContextualChat: boolean;
}

export interface RoomReceptionSummary {
  guestSummary: string | null;
  arrival: string | null;
  departure: string | null;
  checkInStatus: string;
  checkOutStatus: string;
  alerts: ReceptionRoomAlert[];
  notes: string[];
}

export interface RoomDetail {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: string;
  roomStatus: string;
  occupancyStatus: string;
  housekeepingStatus: RoomHousekeepingStatus;
  operationalPriority: string;
  checkoutCompleted: boolean;
  checkoutCompletionSource: CheckoutCompletionSource;
  newGuestToday: boolean;
  arrival: string | null;
  departure: string | null;
  currentStay: RoomCurrentStay | null;
  housekeeping: RoomHousekeeping;
  maintenance: {
    openIssues: number;
    label: string;
    highestPriority: string | null;
    outOfService: boolean;
    tickets: MaintenanceTicketDetail[];
  };
  reception: RoomReceptionSummary;
  notes: RoomNote[];
  timeline: {
    events: RoomTimelineEvent[];
  };
  chatContext: RoomChatContext;
}

export interface CreateRoomMaintenanceTicketPayload {
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  assignmentType?: "INTERNAL" | "EXTERNAL" | null;
  assignedUserId?: string | null;
  externalAssigneeLabel?: string | null;
  externalAssigneeNote?: string | null;
  outOfService?: boolean;
}

export interface RoomDetailResponse {
  success: boolean;
  data?: RoomDetail;
  error?: string;
}

export interface RoomNoteResponse {
  success: boolean;
  data?: RoomNote;
  error?: string;
}
