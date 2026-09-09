import { Hono } from "hono";
import {
  AuthenticationError,
  ForbiddenError,
  isOwner,
  requireModulePermission,
  resolveCurrentUser,
  type AuthBindings,
} from "../services/current-user.service.js";
import {
  getAuthorizedPayrollContractDocument,
  listPayrollContractDocuments,
  PayrollContractDocumentError,
  recordPayrollContractDocumentAccess,
  type PayrollContractDocumentBindings,
} from "../services/payroll-contract-document.service.js";
import {
  normalizePayrollContractUploadFormData,
  PayrollContractUploadError,
  uploadPayrollContractDocument,
} from "../services/payroll-contract-upload.service.js";

interface PayrollContractDocumentRouteBindings extends AuthBindings, PayrollContractDocumentBindings {}

export const payrollContractDocumentRoutes = new Hono<{ Bindings: PayrollContractDocumentRouteBindings }>();

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
}

function errorStatus(error: unknown): 400 | 401 | 403 | 404 | 409 | 500 {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PayrollContractDocumentError) return error.status;
  if (error instanceof PayrollContractUploadError) return error.status;
  return 500;
}

function publicError(error: unknown): string {
  if (error instanceof AuthenticationError || error instanceof ForbiddenError || error instanceof PayrollContractDocumentError || error instanceof PayrollContractUploadError) {
    return error.message;
  }
  return "Contract documents are unavailable.";
}

async function contractReader(c: Parameters<typeof resolveCurrentUser>[0]) {
  const user = await resolveCurrentUser(c);
  requireModulePermission(user, "payroll", "access");
  if (!isOwner(user)) throw new ForbiddenError("Contract documents are available to Owners only.");
  return user;
}

async function contractUploader(c: Parameters<typeof resolveCurrentUser>[0]) {
  const user = await resolveCurrentUser(c);
  requireModulePermission(user, "payroll", "edit");
  if (!isOwner(user)) throw new ForbiddenError("Contract documents are available to Owners only.");
  return user;
}

payrollContractDocumentRoutes.get("/", async (c) => {
  try {
    const user = await contractReader(c);
    const documents = await listPayrollContractDocuments(c.env, user);
    return c.json({ success: true, data: documents }, 200, noStoreHeaders());
  } catch (error) {
    return c.json({ success: false, error: publicError(error) }, errorStatus(error), noStoreHeaders());
  }
});

payrollContractDocumentRoutes.get("/:documentId/file", async (c) => {
  try {
    const user = await contractReader(c);
    const mode = c.req.query("mode") ?? "inline";
    if (mode !== "inline" && mode !== "download") {
      return c.json({ success: false, error: "Document mode is invalid." }, 400, noStoreHeaders());
    }
    const authorized = await getAuthorizedPayrollContractDocument(c.env, user, c.req.param("documentId"));
    await recordPayrollContractDocumentAccess(
      c.env,
      user,
      authorized.document,
      mode === "download" ? "DOWNLOAD" : "VIEW",
    );
    const disposition = mode === "download" ? "attachment" : "inline";
    return c.body(authorized.body, 200, {
      ...noStoreHeaders(),
      "Content-Type": authorized.contentType,
      "Content-Length": String(authorized.document.byteSize),
      "Content-Disposition": `${disposition}; filename="${authorized.fileName}"`,
    });
  } catch (error) {
    return c.json({ success: false, error: publicError(error) }, errorStatus(error), noStoreHeaders());
  }
});

payrollContractDocumentRoutes.post("/admin-upload", async (c) => {
  try {
    const user = await contractUploader(c);
    const result = await uploadPayrollContractDocument(c.env, user, normalizePayrollContractUploadFormData(await c.req.formData()));
    return c.json({ success: true, data: result }, 201, noStoreHeaders());
  } catch (error) {
    return c.json({ success: false, error: publicError(error) }, errorStatus(error), noStoreHeaders());
  }
});
