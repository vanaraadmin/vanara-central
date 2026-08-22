import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { PageError, PageLoading } from "../components/AsyncState";
import { changeCurrentUserPassword, loadCurrentUser, logout } from "../services/auth.service";
import { ApiError } from "../services/api.client";
import { useLanguage } from "../providers/language.context";
import "../styles/AuthPage.css";

export default function PasswordChangeRequiredPage() {
  const queryClient = useQueryClient();
  const { translate } = useLanguage();
  const user = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => loadCurrentUser(signal), retry: false });
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const changePassword = useMutation({
    mutationFn: () => changeCurrentUserPassword(form),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/login");
    },
  });
  const signOut = useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      queryClient.clear();
      window.location.assign("/login");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.currentPassword || !form.newPassword || form.newPassword !== form.confirmPassword || changePassword.isPending) return;
    changePassword.mutate();
  }

  if (user.isLoading) return <PageLoading />;
  if (user.isError) {
    if (user.error instanceof ApiError && user.error.status === 401) return <Navigate replace to="/login" />;
    return <PageError onRetry={() => void user.refetch()} />;
  }
  if (!user.data) return <PageError onRetry={() => void user.refetch()} />;
  if (!user.data.mustChangePassword) return <Navigate replace to="/staff" />;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="required-password-title">
        <div className="auth-card__brand">
          <span aria-hidden="true">V</span>
          <p>Vanara Central</p>
          <h1 id="required-password-title">{translate("passwordChangeRequiredTitle")}</h1>
        </div>
        <p className="auth-help">{translate("passwordChangeRequiredHelp")}</p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>{translate("currentPassword")}</span>
            <input
              autoComplete="current-password"
              type="password"
              value={form.currentPassword}
              onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
            />
          </label>
          <label>
            <span>{translate("newPassword")}</span>
            <input
              autoComplete="new-password"
              type="password"
              value={form.newPassword}
              onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
            />
          </label>
          <label>
            <span>{translate("confirmPassword")}</span>
            <input
              autoComplete="new-password"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
            />
          </label>
          <button
            type="submit"
            disabled={!form.currentPassword || !form.newPassword || form.newPassword !== form.confirmPassword || changePassword.isPending}
          >
            {changePassword.isPending ? translate("saving") : translate("changePassword")}
          </button>
          {changePassword.isError && <p className="auth-error">{translate("passwordCouldNotBeChanged")}</p>}
        </form>
        <button className="auth-secondary-action" type="button" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          {translate("logout")}
        </button>
      </section>
    </main>
  );
}
