export type MaintenanceStatus = "Open" | "In Progress" | "Waiting Parts" | "Completed";
export type MaintenancePriority = "Low" | "Normal" | "High";
export type MaintenanceCategory =
  | "Electrical"
  | "Air Conditioning"
  | "Water"
  | "Furniture"
  | "Bathroom"
  | "Garden"
  | "Cleaning Equipment"
  | "Internet / Network"
  | "Appliance"
  | "Other";
export type MaintenanceAssignmentType = "INTERNAL" | "EXTERNAL";

export interface MaintenanceAssignment {
  type: MaintenanceAssignmentType | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  externalAssigneeLabel: string | null;
  externalAssigneeNote: string | null;
  assignedAt: string | null;
}

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
  locationArea: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignment: MaintenanceAssignment;
  reportedBy: string;
  reportedByName: string;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  closedBy: string | null;
  closedByName: string | null;
  outOfService: boolean;
  waitingReason: string | null;
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

export interface MaintenanceAssignableUser {
  id: string;
  displayName: string;
  role: string;
}

export interface MaintenanceAssignableOptions {
  users: MaintenanceAssignableUser[];
  externalAssignees: string[];
  externalFallbackAvailable: boolean;
}

export interface CreateMaintenanceTicketPayload {
  title: string;
  description: string;
  category?: MaintenanceCategory;
  priority: MaintenancePriority;
  roomId?: number | null;
  accommodationId?: number | null;
  locationArea?: string | null;
  assignmentType?: MaintenanceAssignmentType | null;
  assignedUserId?: string | null;
  externalAssigneeLabel?: string | null;
  externalAssigneeNote?: string | null;
  outOfService?: boolean;
}

export interface UpdateMaintenanceTicketPayload {
  title?: string;
  description?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  roomId?: number | null;
  accommodationId?: number | null;
  locationArea?: string | null;
}

export interface UpdateMaintenanceAssignmentPayload {
  assignmentType?: MaintenanceAssignmentType | null;
  assignedUserId?: string | null;
  externalAssigneeLabel?: string | null;
  externalAssigneeNote?: string | null;
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

export interface MaintenanceAssignableUsersResponse {
  success: boolean;
  data?: MaintenanceAssignableOptions;
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
