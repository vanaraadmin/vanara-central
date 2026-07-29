export interface RoomCurrentStay {
  bookingId: number;
  guestName: string;
  arrival: string;
  departure: string;
  guests: number;
}

export interface RoomDetail {
  unitId: number;
  roomName: string;
  accommodationType: string;
  occupancyStatus: string;
  housekeepingStatus: string;
  operationalPriority: string;
  checkoutCompleted: boolean;
  checkoutCompletionSource: "reception" | "automatic-fallback" | "none";
  newGuestToday: boolean;
  currentStay: RoomCurrentStay | null;
  maintenance: {
    openIssues: number;
    label: string;
  };
  timeline: {
    available: false;
    label: string;
  };
}

export interface RoomDetailResponse {
  success: boolean;
  data?: RoomDetail;
  error?: string;
}