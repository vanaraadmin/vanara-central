export type MaintenanceStatus = "Open" | "Assigned" | "In Progress" | "Waiting Parts" | "Resolved" | "Closed";
export type MaintenancePriority = "Low" | "Medium" | "High" | "Critical";
export type MaintenanceCategory =
  | "Electrical"
  | "Plumbing"
  | "Cleaning"
  | "Furniture"
  | "Air Conditioning"
  | "Garden"
  | "Pool"
  | "Restaurant"
  | "IT"
  | "Other";

export interface MaintenanceTicketSummary {
  id: number;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  roomId: number | null;
  roomName: string | null;
  accommodationId: number | null;
  accommodationName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  reportedBy: string;
  reportedByName: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  noteCount: number;
  photoCount: number;
}

export interface MaintenanceNote {
  id: number;
  ticketId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

export interface MaintenancePhoto {
  id: number;
  ticketId: number;
  storageStatus: "local-reference" | "uploaded";
  localReference: string | null;
  url: string | null;
  caption: string | null;
  addedBy: string;
  addedByName: string;
  createdAt: string;
}

export interface MaintenanceEvent {
  id: number;
  ticketId: number;
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export interface MaintenanceTicketDetail extends MaintenanceTicketSummary {
  notes: MaintenanceNote[];
  photos: MaintenancePhoto[];
  timeline: MaintenanceEvent[];
}

export interface CreateMaintenanceTicketPayload {
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  roomId?: number | null;
  accommodationId?: number | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
}

export interface UpdateMaintenanceTicketPayload {
  title?: string;
  description?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  status?: MaintenanceStatus;
  roomId?: number | null;
  accommodationId?: number | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
}

export interface MaintenanceListResponse {
  success: boolean;
  data?: MaintenanceTicketSummary[];
  error?: string;
}

export interface MaintenanceDetailResponse {
  success: boolean;
  data?: MaintenanceTicketDetail;
  error?: string;
}

export interface MaintenanceNoteResponse {
  success: boolean;
  data?: MaintenanceNote;
  error?: string;
}

export interface MaintenancePhotoResponse {
  success: boolean;
  data?: MaintenancePhoto;
  error?: string;
}
