export type ReceptionCheckInField = "guestArrived" | "passportCollected" | "depositCollected" | "welcomeCompleted" | "keysDelivered";
export type ReceptionCheckOutField = "guestLeft" | "keysReturned" | "depositReturned" | "roomReleased";

export interface ReceptionGuestNote {
  id: number;
  bookingId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

export interface ReceptionEvent {
  id: number;
  bookingId: number;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export interface ReceptionStay {
  bookingId: number;
  guestName: string;
  roomId: number | null;
  roomName: string;
  nationality: string | null;
  nationalityFlag: string | null;
  nationalityFlagUrl: string | null;
  nationalityCode: string | null;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  bookingSource: string | null;
  bookingReference: string | null;
  phone: string | null;
  email: string | null;
  bookingStatus: string;
  roomStatus: string;
  checkIn: Record<ReceptionCheckInField, boolean>;
  checkOut: Record<ReceptionCheckOutField, boolean>;
  specialNotes: string | null;
  notes: ReceptionGuestNote[];
  timeline: ReceptionEvent[];
  links: {
    room: string | null;
    housekeeping: string;
    maintenance: string;
  };
}

export interface ReceptionOverview {
  date: string;
  arrivals: ReceptionStay[];
  departures: ReceptionStay[];
  inHouse: ReceptionStay[];
  summary: {
    arrivals: number;
    departures: number;
    inHouse: number;
  };
}

export interface ReceptionResponse {
  success: boolean;
  data?: ReceptionOverview;
  error?: string;
}

export interface ReceptionStayResponse {
  success: boolean;
  data?: ReceptionStay;
  error?: string;
}
