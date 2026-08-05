export type UserRole = "Owner" | "Manager" | "Reception" | "Housekeeping" | "Maintenance" | "Operations";
export type UserStatus = "invited" | "active" | "disabled";
export type UserView = "owner" | "staff";
export type ModuleKey =
  | "dashboard"
  | "rooms"
  | "housekeeping"
  | "movements"
  | "maintenance"
  | "procurement"
  | "messages"
  | "chat"
  | "social-automation"
  | "owner-dashboard"
  | "settings";

export interface ModulePermission {
  module: ModuleKey;
  canAccess: boolean;
  canEdit: boolean;
}

export type ActionPermissionKey = "can_complete_checkin_checkout";

export interface ActionPermission {
  action: ActionPermissionKey;
  allowed: boolean;
}

export interface CurrentUserView {
  id: string;
  displayName: string;
  fullName: string;
  profilePhotoUrl: string | null;
  role: UserRole;
  preferredLanguage: "en" | "th";
  username: string;
  email: string | null;
  status: UserStatus;
  views: UserView[];
  permissions: ModulePermission[];
  actionPermissions: ActionPermission[];
  isOwner: boolean;
}

export interface ManagedUser extends CurrentUserView {
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface SaveUserPayload {
  fullName: string;
  profilePhotoUrl: string | null;
  role: UserRole;
  preferredLanguage: "en" | "th";
  username: string;
  email: string | null;
  password?: string;
  status: UserStatus;
  views: UserView[];
  permissions: ModulePermission[];
  actionPermissions?: ActionPermission[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const moduleKeys: ModuleKey[] = [
  "dashboard",
  "rooms",
  "housekeeping",
  "movements",
  "maintenance",
  "procurement",
  "messages",
  "chat",
  "social-automation",
  "owner-dashboard",
  "settings",
];

export const roleOptions: UserRole[] = ["Owner", "Manager", "Reception", "Housekeeping", "Maintenance", "Operations"];
export const statusOptions: UserStatus[] = ["invited", "active", "disabled"];
export const viewOptions: UserView[] = ["staff", "owner"];
