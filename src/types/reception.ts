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

export interface BookingPassport {
  id: number;
  bookingId: number;
  objectKey: string;
  source: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  gender: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  tm30Status: "NOT_READY" | "READY" | "EXPORTED";
  fieldVerification: unknown;
  mrzValidation: unknown;
  qualityGate: unknown;
  createdAt: string;
}

export interface PassportData {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  gender: string | null;
  birthDate: string | null;
  expiryDate?: string | null;
  verification?: unknown;
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

export interface BookingPassportsResponse {
  success: boolean;
  data?: BookingPassport[];
  error?: string;
}

export interface BookingPassportResponse {
  success: boolean;
  data?: BookingPassport;
  error?: string;
}

export interface PassportOcrResponse {
  success: boolean;
  objectKey?: string;
  passport?: PassportData;
  requestId?: string;
  timing?: {
    model: string;
    pass1Ms: number;
    pass2Ms: number;
    consensusMs: number;
    totalMs: number;
    pass1Status?: "ok" | "timeout" | "error";
    pass2Status?: "ok" | "timeout" | "error";
    pass1OpenAiRequestId?: string | null;
    pass2OpenAiRequestId?: string | null;
    pass1Attempts?: number;
    pass2Attempts?: number;
    deterministicValidationMs?: number;
    conditionalVerificationMs?: number;
    conditionalVerificationInvoked?: boolean;
    visualModel?: string;
    mrzModel?: string;
    visualMs?: number;
    mrzMs?: number;
    mergeMs?: number;
    verifierMs?: number;
    visualStatus?: "ok" | "timeout" | "error";
    mrzStatus?: "ok" | "timeout" | "error";
    visualOpenAiRequestId?: string | null;
    mrzOpenAiRequestId?: string | null;
    verifierOpenAiRequestId?: string | null;
    verifierTriggerCode?: "PASSPORT_NUMBER_CONFLICT" | "MRZ_CHECKSUM_FAILED" | "MANDATORY_FIELD_MISSING" | "CRITICAL_CHARACTER_UNCERTAIN" | null;
    verifierTimedOut?: boolean;
    manualConfirmationRequired?: boolean;
  };
  error?: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export interface PassportClassification {
  isPassport: boolean;
  isPassportBiodataPage: boolean;
  passportConfidence: number;
  passportComplete: boolean;
  mrzVisible: boolean;
  excessiveGlare: boolean;
  unreadableBlur: boolean;
  unreadableDarkness: boolean;
  recommendation: string;
}

export interface PassportClassificationDecision {
  ready: boolean;
  code:
    | "passport_ready"
    | "not_a_passport"
    | "not_biodata_page"
    | "passport_confidence_low"
    | "passport_incomplete"
    | "mrz_not_visible"
    | "unreadable_darkness"
    | "unreadable_blur"
    | "excessive_glare";
  messageKey:
    | "passport.ready"
    | "passport.notPassport"
    | "passport.notBiodataPage"
    | "passport.moveCloser"
    | "passport.pageIncomplete"
    | "passport.showMrz"
    | "passport.moreLight"
    | "passport.tooBlurry"
    | "passport.avoidReflections";
  message: string;
}

export interface PassportClassificationResponse {
  success: boolean;
  classification?: PassportClassification;
  decision?: PassportClassificationDecision;
  requestId?: string;
  timing?: {
    model: string;
    classificationMs: number;
    httpStatus?: number;
    openAiRequestId?: string | null;
  };
  error?: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export interface PassportLivePreflight {
  biodataPageDetected: boolean;
  documentInsideFrame: boolean;
  mrzLikelyVisible: boolean;
  confidence: number;
  instruction:
    | "searching"
    | "move_inside_frame"
    | "open_biodata_page"
    | "move_closer"
    | "show_bottom_code"
    | "hold_steady"
    | "more_light"
    | "ready";
}

export interface PassportLivePreflightResponse {
  success: boolean;
  preflight?: PassportLivePreflight;
  ready?: boolean;
  requestId?: string;
  timing?: {
    model: string;
    livePreflightMs: number;
    httpStatus?: number;
    openAiRequestId?: string | null;
  };
  error?: {
    code: string;
    message: string;
    requestId?: string;
  };
}
