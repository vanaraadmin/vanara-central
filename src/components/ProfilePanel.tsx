import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changeCurrentUserPassword,
  createUser,
  deleteUser,
  disableUser,
  listUsers,
  loadCurrentUser,
  logout,
  updateCurrentUserProfile,
} from "../services/auth.service";
import { useLanguage } from "../providers/language.context";
import { DownloadIcon, SettingsGearIcon } from "./OperationsIcons";
import type { CurrentUserView, ManagedUser, ModuleKey, ModulePermission, SaveUserPayload } from "../types/auth";
import { moduleKeys } from "../types/auth";

const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoBytes = 512 * 1024;

type PanelTab = "profile" | "password" | "updates" | "owner";

function initialsFor(user: CurrentUserView | ManagedUser): string {
  const source = user.displayName || user.fullName || user.username;
  const letters = source.split(/\s+/).map((part) => part.trim().slice(0, 1)).filter(Boolean).slice(0, 2).join("");
  return letters || "V";
}

function roleLabel(user: CurrentUserView, translate: ReturnType<typeof useLanguage>["translate"]): string {
  return user.isOwner ? translate("owner") : translate("staff");
}

function userPermissions(owner: boolean): ModulePermission[] {
  return moduleKeys.map((module) => {
    if (owner) return { module, canAccess: true, canEdit: true };
    const staffModules: ModuleKey[] = ["dashboard", "rooms", "housekeeping", "movements", "maintenance", "procurement", "chat"];
    const canAccess = staffModules.includes(module);
    return { module, canAccess, canEdit: canAccess && module !== "dashboard" && module !== "chat" };
  });
}

function emptyUserForm(): SaveUserPayload {
  return {
    firstName: "",
    lastName: "",
    fullName: "",
    displayName: "",
    profilePhotoUrl: null,
    role: "Operations",
    preferredLanguage: "th",
    username: "",
    email: null,
    password: "",
    status: "active",
    views: ["staff"],
    permissions: userPermissions(false),
    actionPermissions: [{ action: "can_complete_checkin_checkout", allowed: false }],
  };
}

function profileErrorText(error: unknown, translate: ReturnType<typeof useLanguage>["translate"]): string {
  const message = error instanceof Error ? error.message : "";
  if (/photo.*large|large.*photo/i.test(message)) return translate("profilePhotoTooLarge");
  if (/profile photo|photo/i.test(message)) return translate("useSupportedProfilePhoto");
  return translate("actionCouldNotBeCompleted");
}

function passwordErrorText(error: unknown, translate: ReturnType<typeof useLanguage>["translate"]): string {
  const message = error instanceof Error ? error.message : "";
  if (/current password is incorrect/i.test(message)) return translate("currentPasswordIncorrect");
  return translate("passwordCouldNotBeChanged");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Photo could not be read.")));
    reader.addEventListener("error", () => reject(new Error("Photo could not be read.")));
    reader.readAsDataURL(file);
  });
}

function UserAvatar({ user }: { user: CurrentUserView | ManagedUser }) {
  return (
    <span className="profile-panel__avatar" aria-hidden="true">
      {user.profilePhotoUrl ? <img src={user.profilePhotoUrl} alt="" /> : initialsFor(user)}
    </span>
  );
}

export default function ProfilePanel() {
  const { changeLanguage, language, translate } = useLanguage();
  const dialogTitleId = useId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("profile");
  const [profileDraft, setProfileDraft] = useState({ displayName: "", preferredLanguage: language, profilePhotoUrl: null as string | null });
  const [profilePhotoName, setProfilePhotoName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [userForm, setUserForm] = useState<SaveUserPayload>(emptyUserForm);
  const [userPhotoName, setUserPhotoName] = useState("");
  const [showUserForm, setShowUserForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const userPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: ({ signal }) => loadCurrentUser(signal),
    retry: false,
    staleTime: 60_000,
  });
  const usersQuery = useQuery({
    queryKey: ["users", "profile-panel"],
    queryFn: ({ signal }) => listUsers(signal),
    enabled: open && currentUserQuery.data?.isOwner === true,
  });

  const currentUser = currentUserQuery.data;

  useEffect(() => {
    if (!currentUser?.preferredLanguage || currentUser.preferredLanguage === language) return;
    changeLanguage(currentUser.preferredLanguage);
  }, [changeLanguage, currentUser?.preferredLanguage, language]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const saveProfile = useMutation({
    mutationFn: () => updateCurrentUserProfile(profileDraft),
    onSuccess: async (updated) => {
      setNotice(translate("profileSaved"));
      changeLanguage(updated.preferredLanguage);
      await queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
  });

  const changePassword = useMutation({
    mutationFn: () => changeCurrentUserPassword(passwordDraft),
    onSuccess: () => {
      setPasswordDraft({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice(translate("passwordChangedSignInAgain"));
      window.setTimeout(() => window.location.assign("/login"), 2800);
    },
  });

  const saveUser = useMutation({
    mutationFn: () => {
      const payload = {
        ...userForm,
        fullName: `${userForm.firstName} ${userForm.lastName}`.trim(),
      };
      return createUser(payload);
    },
    onSuccess: async () => {
      setUserForm(emptyUserForm());
      setNotice("User saved");
      setShowUserForm(false);
      setUserPhotoName("");
      await usersQuery.refetch();
    },
  });

  const freezeUser = useMutation({
    mutationFn: (id: string) => disableUser(id),
    onSuccess: async () => {
      setNotice("User frozen");
      await usersQuery.refetch();
    },
  });

  const removeUser = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: async () => {
      setNotice("User deleted");
      await usersQuery.refetch();
    },
  });
  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      window.location.assign("/login");
    },
  });

  async function onProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!photoTypes.has(file.type)) {
      setProfileError(translate("useSupportedProfilePhoto"));
      event.target.value = "";
      return;
    }
    if (file.size > maxPhotoBytes) {
      setProfileError(translate("profilePhotoTooLarge"));
      event.target.value = "";
      return;
    }
    setProfileError(null);
    const dataUrl = await fileToDataUrl(file);
    setProfileDraft((current) => ({ ...current, profilePhotoUrl: dataUrl }));
    setProfilePhotoName(file.name);
  }

  async function onUserPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!photoTypes.has(file.type) || file.size > maxPhotoBytes) {
      setNotice(translate("useSupportedProfilePhoto"));
      event.target.value = "";
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setUserForm((current) => ({ ...current, profilePhotoUrl: dataUrl }));
    setUserPhotoName(file.name);
  }

  function startCreate(owner: boolean) {
    const next = emptyUserForm();
    next.role = owner ? "Owner" : "Operations";
    next.preferredLanguage = owner ? "en" : "th";
    next.views = owner ? ["owner", "staff"] : ["staff"];
    next.permissions = userPermissions(owner);
    next.actionPermissions = [{ action: "can_complete_checkin_checkout", allowed: owner }];
    setUserForm(next);
    setUserPhotoName("");
    setShowUserForm(true);
  }

  function setUserRole(ownerRole: boolean) {
    setUserForm((current) => ({
      ...current,
      role: ownerRole ? "Owner" : "Operations",
      preferredLanguage: ownerRole ? "en" : current.preferredLanguage,
      views: ownerRole ? ["owner", "staff"] : ["staff"],
      permissions: userPermissions(ownerRole),
      actionPermissions: [{ action: "can_complete_checkin_checkout", allowed: ownerRole }],
    }));
  }

  function onSubmitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userForm.firstName.trim() || !userForm.lastName.trim() || !userForm.displayName.trim() || !userForm.username.trim() || !userForm.password) return;
    saveUser.mutate();
  }

  const owner = currentUser?.isOwner === true;
  const tabs: Array<{ id: PanelTab; label: string; ownerOnly?: boolean }> = [
    { id: "profile", label: translate("profile") },
    { id: "password", label: translate("password") },
    { id: "updates", label: translate("updateVanaraCentral") },
    { id: "owner", label: "Owner", ownerOnly: true },
  ];

  return (
    <div className="profile-panel">
      <button
        aria-label={translate("profile")}
        className="profile-panel__trigger vc-interactive-surface"
        onClick={() => {
          if (currentUser) {
            setProfileDraft({
              displayName: currentUser.displayName,
              preferredLanguage: currentUser.preferredLanguage,
              profilePhotoUrl: currentUser.profilePhotoUrl,
            });
            setProfilePhotoName("");
          }
          setOpen(true);
          setTab("profile");
        }}
        title={translate("profile")}
        type="button"
      >
        <SettingsGearIcon />
      </button>

      {open ? (
        <div className="profile-panel__overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <section aria-labelledby={dialogTitleId} aria-modal="true" className="profile-panel__sheet" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <header className="profile-panel__header">
              {currentUser ? <UserAvatar user={currentUser} /> : <span className="profile-panel__avatar" aria-hidden="true">V</span>}
              <div className="profile-panel__identity">
                <h2 id={dialogTitleId}>{currentUser?.displayName || currentUser?.username || translate("profile")}</h2>
                <p>{currentUser ? roleLabel(currentUser, translate) : translate("loading")}</p>
                <span className="profile-panel__language-chip">{language.toUpperCase()}</span>
              </div>
              <button aria-label={translate("close")} className="profile-panel__close" onClick={() => setOpen(false)} type="button">x</button>
            </header>

            <nav className="profile-panel__tabs" aria-label={translate("profileSections")}>
              {tabs.filter((item) => !item.ownerOnly || owner).map((item) => (
                <button className={tab === item.id ? "is-active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button">{item.label}</button>
              ))}
            </nav>

            <div className="profile-panel__body">
              {tab === "profile" ? (
                <>
                  <section className="profile-panel__section" aria-label={translate("profile")}>
                    <dl className="profile-panel__facts">
                      <div><dt>{translate("firstName")}</dt><dd>{currentUser?.firstName || "-"}</dd></div>
                      <div><dt>{translate("lastName")}</dt><dd>{currentUser?.lastName || "-"}</dd></div>
                    </dl>
                    <label className="profile-panel__field"><span>{translate("nickname")}</span><input required value={profileDraft.displayName} onChange={(event) => setProfileDraft({ ...profileDraft, displayName: event.target.value })} /></label>
                    <div className="profile-panel__field"><span>{translate("language")}</span><div className="profile-panel__segments"><button className={profileDraft.preferredLanguage === "en" ? "is-active" : ""} onClick={() => setProfileDraft({ ...profileDraft, preferredLanguage: "en" })} type="button">EN</button><button className={profileDraft.preferredLanguage === "th" ? "is-active" : ""} onClick={() => setProfileDraft({ ...profileDraft, preferredLanguage: "th" })} type="button">TH</button></div></div>
                    <div className="profile-panel__photo-row">
                      {profileDraft.profilePhotoUrl ? <img className="profile-panel__avatar-preview" src={profileDraft.profilePhotoUrl} alt={translate("profilePreview")} /> : <span className="profile-panel__avatar-preview" aria-hidden="true">{currentUser ? initialsFor(currentUser) : "V"}</span>}
                      <div>
                        <span className="profile-panel__photo-label">{translate("avatar")}</span>
                        <input ref={profilePhotoInputRef} className="profile-panel__file-input" accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => void onProfilePhoto(event)} />
                        <button className="profile-panel__secondary profile-panel__photo-button" onClick={() => profilePhotoInputRef.current?.click()} type="button">{translate("changePhoto")}</button>
                        {profilePhotoName ? <p className="profile-panel__filename">{profilePhotoName}</p> : null}
                      </div>
                    </div>
                    {profileError ? <p className="profile-panel__error">{profileError}</p> : null}
                    <button className="profile-panel__primary" disabled={saveProfile.isPending || !profileDraft.displayName.trim()} onClick={() => saveProfile.mutate()} type="button">{saveProfile.isPending ? translate("saving") : translate("save")}</button>
                  </section>
                  <section className="profile-panel__section" aria-label={translate("notifications")}><h3>{translate("notifications")}</h3><p className="profile-panel__empty">{translate("notificationsPlaceholder")}</p></section>
                  <button className="profile-panel__logout" disabled={logoutMutation.isPending} onClick={() => logoutMutation.mutate()} type="button">{translate("logout")}</button>
                </>
              ) : null}

              {tab === "updates" ? (
                <section className="profile-panel__section profile-panel__update" aria-label={translate("updateVanaraCentral")}>
                  <h3>{translate("updateVanaraCentral")}</h3>
                  <p className="profile-panel__empty">{translate("pwaUpdatePlaceholder")}</p>
                </section>
              ) : null}

              {tab === "password" ? (
                <section className="profile-panel__section">
                  <h3>{translate("password")}</h3>
                  <label className="profile-panel__field"><span>{translate("currentPassword")}</span><input type="password" value={passwordDraft.currentPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, currentPassword: event.target.value })} /></label>
                  <label className="profile-panel__field"><span>{translate("newPassword")}</span><input type="password" value={passwordDraft.newPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, newPassword: event.target.value })} /></label>
                  <label className="profile-panel__field"><span>{translate("confirmPassword")}</span><input type="password" value={passwordDraft.confirmPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, confirmPassword: event.target.value })} /></label>
                  <button className="profile-panel__primary" disabled={changePassword.isPending || !passwordDraft.currentPassword || !passwordDraft.newPassword || passwordDraft.newPassword !== passwordDraft.confirmPassword} onClick={() => changePassword.mutate()} type="button">{translate("changePassword")}</button>
                </section>
              ) : null}

              {tab === "owner" && owner ? (
                <section className="profile-panel__section profile-panel__owner-actions" aria-label="Owner">
                  <header className="profile-panel__subheader"><h3>Owner</h3></header>
                  <a className="profile-panel__download" href="/api/owner/tm30/export"><DownloadIcon /><span>{translate("downloadTm30")}</span></a>
                  <header className="profile-panel__subheader profile-panel__subheader--users"><h3>Manage Users</h3><div><button type="button" onClick={() => startCreate(false)}>New staff</button><button type="button" onClick={() => startCreate(true)}>New owner</button></div></header>
                  <div className="profile-panel__user-list">
                    {(usersQuery.data ?? []).map((item) => (
                      <article className="profile-panel__user-row" key={item.id}>
                        <UserAvatar user={item} />
                        <div><strong>{item.displayName}</strong><span>{item.fullName}</span><small>{item.role} / {item.preferredLanguage.toUpperCase()} / {item.status}</small></div>
                        <div className="profile-panel__user-actions">
                          <button disabled={item.id === currentUser?.id || item.status === "disabled"} onClick={() => window.confirm(`Freeze ${item.displayName}?`) && freezeUser.mutate(item.id)} type="button">Freeze</button>
                          <button disabled={item.id === currentUser?.id} onClick={() => window.confirm(`Delete ${item.displayName}? This cannot be undone.`) && removeUser.mutate(item.id)} type="button">Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {showUserForm ? <form className="profile-panel__user-form" onSubmit={onSubmitUser}>
                    <h4>Create user</h4>
                    <div className="profile-panel__role-toggle" role="group" aria-label="Role">
                      <button className={userForm.role !== "Owner" ? "is-active" : ""} onClick={() => setUserRole(false)} type="button">Staff</button>
                      <button className={userForm.role === "Owner" ? "is-active" : ""} onClick={() => setUserRole(true)} type="button">Owner</button>
                    </div>
                    <div className="profile-panel__form-grid">
                      <label><span>First name</span><input value={userForm.firstName} onChange={(event) => setUserForm({ ...userForm, firstName: event.target.value })} required /></label>
                      <label><span>Last name</span><input value={userForm.lastName} onChange={(event) => setUserForm({ ...userForm, lastName: event.target.value })} required /></label>
                      <label><span>Nickname</span><input value={userForm.displayName} onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })} required /></label>
                      <label><span>Username</span><input value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} required /></label>
                      <label><span>Password</span><input type="password" value={userForm.password ?? ""} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} required /></label>
                      <label><span>Language</span><select value={userForm.preferredLanguage} onChange={(event) => setUserForm({ ...userForm, preferredLanguage: event.target.value as "en" | "th" })}><option value="en">EN</option><option value="th">TH</option></select></label>
                    </div>
                    <div className="profile-panel__photo-row">
                      {userForm.profilePhotoUrl ? <img className="profile-panel__avatar-preview" src={userForm.profilePhotoUrl} alt="User avatar preview" /> : <span className="profile-panel__avatar-preview" aria-hidden="true">{userForm.displayName.slice(0, 2) || "U"}</span>}
                      <div>
                        <span className="profile-panel__photo-label">Avatar</span>
                        <input ref={userPhotoInputRef} className="profile-panel__file-input" accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => void onUserPhoto(event)} />
                        <button className="profile-panel__secondary profile-panel__photo-button" onClick={() => userPhotoInputRef.current?.click()} type="button">Change photo</button>
                        {userPhotoName ? <p className="profile-panel__filename">{userPhotoName}</p> : null}
                      </div>
                    </div>
                    <div className="profile-panel__form-actions"><button className="profile-panel__secondary" onClick={() => setShowUserForm(false)} type="button">Cancel</button><button className="profile-panel__primary" disabled={saveUser.isPending} type="submit">{saveUser.isPending ? "Saving" : "Create user"}</button></div>
                  </form> : null}
                </section>
              ) : null}

              {(notice || saveProfile.isError || changePassword.isError || saveUser.isError || freezeUser.isError || removeUser.isError) ? (
                <p className={saveProfile.isError || changePassword.isError || saveUser.isError || freezeUser.isError || removeUser.isError ? "profile-panel__error" : "profile-panel__notice"}>
                  {changePassword.isError
                    ? passwordErrorText(changePassword.error, translate)
                    : saveProfile.isError || saveUser.isError || freezeUser.isError || removeUser.isError
                      ? profileErrorText(saveProfile.error || saveUser.error || freezeUser.error || removeUser.error, translate)
                    : notice}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
