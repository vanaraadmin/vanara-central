import type { Context } from "hono";

export interface CurrentUser {
  id: string;
  displayName: string;
  role: string;
}

export class ForbiddenError extends Error {
  constructor(message = "Owner access is required.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const TEMPORARY_USER: CurrentUser = {
  id: "local-reception",
  displayName: "Reception",
  role: "Operations",
};

const OWNER_NAMES = new Set(["stefano", "jf"]);
const OWNER_ROLES = new Set(["owner", "cio"]);

function cleanHeader(value: string | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 80 ? trimmed : fallback;
}

export function resolveCurrentUser(c: Context): CurrentUser {
  return {
    id: cleanHeader(c.req.header("x-vanara-user-id") ?? null, TEMPORARY_USER.id),
    displayName: cleanHeader(c.req.header("x-vanara-user-name") ?? null, TEMPORARY_USER.displayName),
    role: cleanHeader(c.req.header("x-vanara-user-role") ?? null, TEMPORARY_USER.role),
  };
}

export function isOwner(user: CurrentUser): boolean {
  const role = user.role.trim().toLowerCase();
  const name = user.displayName.trim().toLowerCase();
  const id = user.id.trim().toLowerCase();
  return OWNER_ROLES.has(role) || OWNER_NAMES.has(name) || OWNER_NAMES.has(id);
}

export function requireOwner(user: CurrentUser): void {
  if (!isOwner(user)) throw new ForbiddenError();
}

export function publicCurrentUser(user: CurrentUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    isOwner: isOwner(user),
  };
}
