import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { createUser, disableUser, listUsers, updateUser } from "../services/auth.service";
import { listWarapornKbBackups } from "../services/waraporn-kb.service";
import type { ActionPermissionKey, ManagedUser, ModuleKey, ModulePermission, SaveUserPayload, UserRole, UserStatus, UserView } from "../types/auth";
import { moduleKeys, roleOptions, statusOptions, viewOptions } from "../types/auth";
import type { WarapornKbBackupSummary } from "../types/waraporn-kb";
import "../styles/AuthPage.css";

const defaultPermissions = moduleKeys.map((module) => ({ module, canAccess: module === "dashboard", canEdit: false }));
const actionPermissionLabels: Record<ActionPermissionKey, string> = {
  can_complete_checkin_checkout: "Complete check-in / check-out",
};
const defaultActionPermissions = (Object.keys(actionPermissionLabels) as ActionPermissionKey[]).map((action) => ({ action, allowed: false }));
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxPhotoBytes = 512 * 1024;

function emptyForm(): SaveUserPayload {
  return {
    firstName: "",
    lastName: "",
    fullName: "",
    displayName: "",
    profilePhotoUrl: null,
    role: "Operations",
    preferredLanguage: "en",
    username: "",
    email: null,
    password: "",
    status: "invited",
    views: ["staff"],
    permissions: defaultPermissions,
    actionPermissions: defaultActionPermissions,
  };
}

function can(permission: ModulePermission[], module: ModuleKey, field: "canAccess" | "canEdit") {
  return permission.find((item) => item.module === module)?.[field] ?? false;
}

function canAction(payload: SaveUserPayload, action: ActionPermissionKey) {
  return payload.actionPermissions?.find((item) => item.action === action)?.allowed ?? false;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatBackupDate(value: string | null): string {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function WarapornKbBackupPanel(props: { latest: WarapornKbBackupSummary | null; backups: WarapornKbBackupSummary[] }) {
  const latest = props.latest;
  const previous = props.backups.filter((backup) => backup.backupId !== latest?.backupId);
  return (
    <section className="kb-backup-panel" aria-label="Waraporn KB Backup">
      <header>
        <div>
          <p>Owner recovery</p>
          <h2>Waraporn KB Backup</h2>
          <span>Private R2 archive. No document preview.</span>
        </div>
      </header>
      {latest ? (
        <>
          <dl className="kb-backup-panel__stats">
            <div><dt>Latest backup</dt><dd>{formatBackupDate(latest.completedAt ?? latest.createdAt)}</dd></div>
            <div><dt>Status</dt><dd>{latest.status}</dd></div>
            <div><dt>Total files</dt><dd>{latest.totalFileCount}</dd></div>
            <div><dt>Markdown files</dt><dd>{latest.markdownFileCount}</dd></div>
            <div><dt>Total size</dt><dd>{formatBytes(latest.totalBytes)}</dd></div>
            <div><dt>Manifest checksum</dt><dd>{latest.manifestChecksum}</dd></div>
          </dl>
          <div className="kb-backup-panel__collections" aria-label="Collections">
            {latest.topLevelCollections.map((collection) => <span key={collection}>{collection}</span>)}
          </div>
          <a className="kb-backup-panel__download" href={`/api/management/waraporn-kb-backups/${encodeURIComponent(latest.backupId)}/download`}>
            Download Complete Backup
          </a>
          <div className="kb-backup-panel__versions">
            <strong>Previous complete versions</strong>
            {previous.length === 0 ? <span>None</span> : previous.map((backup) => (
              <a key={backup.backupId} href={`/api/management/waraporn-kb-backups/${encodeURIComponent(backup.backupId)}/download`}>
                {formatBackupDate(backup.completedAt ?? backup.createdAt)}
              </a>
            ))}
          </div>
        </>
      ) : (
        <p className="kb-backup-panel__empty">No complete Waraporn KB backup is available yet.</p>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: ({ signal }) => listUsers(signal) });
  const kbBackupsQuery = useQuery({ queryKey: ["waraporn-kb-backups"], queryFn: ({ signal }) => listWarapornKbBackups(signal) });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SaveUserPayload>(emptyForm);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const selected = useMemo(() => usersQuery.data?.find((user) => user.id === editingId) ?? null, [editingId, usersQuery.data]);
  const payrollIdentityForm = useMemo(() => ({
    ...form,
    fullName: `${form.firstName} ${form.lastName}`.trim(),
  }), [form]);
  const saveMutation = useMutation({
    mutationFn: () => editingId
      ? updateUser(editingId, Object.fromEntries(Object.entries(payrollIdentityForm).filter(([key, value]) => key !== "password" || Boolean(value))) as Partial<SaveUserPayload>)
      : createUser(payrollIdentityForm),
    onSuccess: async () => {
      setEditingId(null);
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const disableMutation = useMutation({
    mutationFn: (id: string) => disableUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  function edit(user: ManagedUser) {
    setEditingId(user.id);
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      displayName: user.displayName,
      profilePhotoUrl: user.profilePhotoUrl,
      role: user.role,
      preferredLanguage: user.preferredLanguage,
      username: user.username,
      email: user.email,
      password: "",
      status: user.status,
      views: user.views,
      permissions: user.permissions,
      actionPermissions: user.actionPermissions,
    });
  }

  function setPermission(module: ModuleKey, field: "canAccess" | "canEdit", value: boolean) {
    setForm((current) => ({
      ...current,
      permissions: moduleKeys.map((key) => {
        const permission = current.permissions.find((item) => item.module === key) ?? { module: key, canAccess: false, canEdit: false };
        if (key !== module) return permission;
        const next = { ...permission, [field]: value };
        if (field === "canEdit" && value) next.canAccess = true;
        if (field === "canAccess" && !value) next.canEdit = false;
        return next;
      }),
    }));
  }

  function setActionPermission(action: ActionPermissionKey, allowed: boolean) {
    setForm((current) => ({
      ...current,
      actionPermissions: (Object.keys(actionPermissionLabels) as ActionPermissionKey[]).map((key) => {
        const permission = current.actionPermissions?.find((item) => item.action === key) ?? { action: key, allowed: false };
        return key === action ? { ...permission, allowed } : permission;
      }),
    }));
  }

  function toggleView(view: UserView, enabled: boolean) {
    setForm((current) => ({
      ...current,
      views: enabled ? [...new Set([...current.views, view])] : current.views.filter((item) => item !== view),
    }));
  }

  function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!allowedPhotoTypes.has(file.type)) {
      setPhotoError("Use JPG, PNG, WebP or GIF.");
      event.target.value = "";
      return;
    }
    if (file.size > maxPhotoBytes) {
      setPhotoError("Profile photo must be 512 KB or smaller.");
      event.target.value = "";
      return;
    }
    setPhotoError(null);
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setForm((current) => ({ ...current, profilePhotoUrl: reader.result as string }));
    });
    reader.readAsDataURL(file);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.username.trim() || form.views.length === 0 || (!editingId && !form.password)) return;
    saveMutation.mutate();
  }

  if (usersQuery.isLoading) return <PageLoading />;
  if (usersQuery.isError) return <PageError onRetry={() => void usersQuery.refetch()} />;

  return (
    <main className="settings-page">
      <header className="settings-header">
        <div>
          <p>Owner settings</p>
          <h1>User access</h1>
          <span>Authentication, views and module permissions</span>
        </div>
        <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>New user</button>
      </header>

      <section className="settings-grid">
        <div className="user-list">
          {kbBackupsQuery.isLoading ? (
            <section className="kb-backup-panel" aria-label="Waraporn KB Backup"><p className="kb-backup-panel__empty">Loading Waraporn KB backup.</p></section>
          ) : kbBackupsQuery.isError ? (
            <section className="kb-backup-panel" aria-label="Waraporn KB Backup"><p className="auth-error">Waraporn KB backup is unavailable.</p></section>
          ) : (
            <WarapornKbBackupPanel latest={kbBackupsQuery.data?.latest ?? null} backups={kbBackupsQuery.data?.backups ?? []} />
          )}

          {(usersQuery.data ?? []).map((user) => (
            <article className="user-row" key={user.id}>
              <div className="user-row__avatar">{user.profilePhotoUrl ? <img src={user.profilePhotoUrl} alt="" /> : user.fullName.slice(0, 1)}</div>
              <div>
                <strong>{user.fullName}</strong>
                <span>{user.role} · {user.status}</span>
                <small>{user.views.join(" + ")}</small>
              </div>
              <button type="button" onClick={() => edit(user)}>Edit</button>
              {user.status !== "disabled" && <button type="button" onClick={() => disableMutation.mutate(user.id)}>Disable</button>}
            </article>
          ))}
        </div>

        <form className="user-form" onSubmit={submit}>
          <h2>{selected ? `Edit ${selected.fullName}` : "Create user"}</h2>
          <div className="form-row">
            <label><span>First name</span><input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value, fullName: `${event.target.value} ${form.lastName}`.trim() })} /></label>
            <label><span>Last name</span><input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value, fullName: `${form.firstName} ${event.target.value}`.trim() })} /></label>
          </div>
          <label><span>Username</span><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
          <label><span>Nickname</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <label><span>Email optional</span><input value={form.email ?? ""} onChange={(event) => setForm({ ...form, email: event.target.value || null })} /></label>
          <label><span>Password {editingId ? "optional" : "required"}</span><input type="password" value={form.password ?? ""} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          <label><span>Profile photo</span><input accept="image/*" type="file" onChange={uploadPhoto} /></label>
          {photoError && <p className="auth-error">{photoError}</p>}
          {form.profilePhotoUrl && <img className="profile-preview" src={form.profilePhotoUrl} alt="Profile preview" />}
          <div className="form-row">
            <label><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>
            <label><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as UserStatus })}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label><span>Language</span><select value={form.preferredLanguage} onChange={(event) => setForm({ ...form, preferredLanguage: event.target.value as "en" | "th" })}><option value="en">English</option><option value="th">Thai</option></select></label>
          </div>
          <fieldset>
            <legend>Views</legend>
            {viewOptions.map((view) => <label className="check-line" key={view}><input checked={form.views.includes(view)} type="checkbox" onChange={(event) => toggleView(view, event.target.checked)} />{view}</label>)}
          </fieldset>
          <fieldset>
            <legend>Module permissions</legend>
            <div className="permission-list">
              {moduleKeys.map((module) => (
                <div className="permission-row" key={module}>
                  <strong>{module}</strong>
                  <label><input checked={can(form.permissions, module, "canAccess")} type="checkbox" onChange={(event) => setPermission(module, "canAccess", event.target.checked)} /> Access</label>
                  <label><input checked={can(form.permissions, module, "canEdit")} type="checkbox" onChange={(event) => setPermission(module, "canEdit", event.target.checked)} /> Edit</label>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Operational actions</legend>
            {(Object.keys(actionPermissionLabels) as ActionPermissionKey[]).map((action) => (
              <label className="check-line" key={action}>
                <input checked={canAction(form, action)} type="checkbox" onChange={(event) => setActionPermission(action, event.target.checked)} />
                {actionPermissionLabels[action]}
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving…" : "Save user"}</button>
          {saveMutation.isError && <p className="auth-error">User could not be saved.</p>}
        </form>
      </section>
    </main>
  );
}
