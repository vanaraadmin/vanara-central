import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { login } from "../services/auth.service";
import "../styles/AuthPage.css";

export default function LoginPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const from = typeof location.state === "object" && location.state && "from" in location.state && typeof location.state.from === "string"
    ? location.state.from
    : "/staff";
  const mutation = useMutation({
    mutationFn: () => login({ username, password }),
    onSuccess: async (user) => {
      queryClient.setQueryData(["current-user"], user);
      window.location.assign(from);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password || mutation.isPending) return;
    mutation.mutate();
  }

  if (mutation.isSuccess) return <Navigate replace to={from} />;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <span>🌿</span>
          <p>Vanara Central</p>
          <h1>Sign in</h1>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Username or email</span>
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit" disabled={!username.trim() || !password || mutation.isPending}>
            {mutation.isPending ? "Signing in…" : "Login"}
          </button>
          {mutation.isError && <p className="auth-error">Invalid username or password.</p>}
        </form>
        <p className="auth-help">Accounts are created by an Owner. Public registration is disabled.</p>
      </section>
    </main>
  );
}
