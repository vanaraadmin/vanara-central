export type ReservationType = "arrival" | "departure" | "stayover";

export type RoomStatus =
  | "ready"
  | "cleaning"
  | "occupied"
  | "leaving"
  | "unknown";

export interface Beds24Reservation {
  id: number;
  propertyId: number;
  roomId: number;

  firstName: string;
  lastName: string;

  arrival: string;
  departure: string;

  numAdult: number;

  channel?: string;
  apiReference?: string;
}

export interface Reservation {
  id: number;

  propertyId: number;
  roomId: number;

  roomName: string;
  guestName: string;

  arrival: string;
  departure: string;

  numAdults: number;

  channel?: string;
  reference?: string;

  type: ReservationType;
  status: RoomStatus;
}