import { Hono } from "hono";
import {
  AuthenticationError,
  ForbiddenError,
  requireOwner,
  resolveCurrentUser,
  type AuthBindings,
} from "../services/current-user.service.js";
import {
  normalizePayrollStaffProvisioningRequest,
  PayrollStaffProvisioningError,
  provisionPayrollStaffAccounts,
  type PayrollStaffProvisioningBindings,
} from "../services/payroll-staff-provisioning.service.js";

interface PayrollStaffProvisioningRouteBindings extends AuthBindings, PayrollStaffProvisioningBindings {}

export const payrollStaffProvisioningRoutes = new Hono<{ Bindings: PayrollStaffProvisioningRouteBindings }>();

function errorStatus(error: unknown): 400 | 401 | 403 | 404 | 409 | 500 {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PayrollStaffProvisioningError) return error.status;
  return 500;
}

function publicError(error: unknown): string {
  if (error instanceof AuthenticationError || error instanceof ForbiddenError || error instanceof PayrollStaffProvisioningError) {
    return error.message;
  }
  return "Staff account provisioning is unavailable.";
}

payrollStaffProvisioningRoutes.post("/", async (c) => {
  try {
    const actor = await resolveCurrentUser(c);
    requireOwner(actor);
    const payload = await c.req.json().catch(() => null);
    const request = normalizePayrollStaffProvisioningRequest(payload);
    const result = await provisionPayrollStaffAccounts(c.env, actor, request);
    return c.json({ success: true, data: result }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return c.json(
      { success: false, error: publicError(error) },
      errorStatus(error),
      { "Cache-Control": "private, no-store" },
    );
  }
});
