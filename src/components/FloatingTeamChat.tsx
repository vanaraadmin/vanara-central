import { useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import wechatIcon from "../assets/img/wechat-logo-light.svg";
import { loadCurrentUser } from "../services/auth.service";
import "../styles/FloatingTeamChat.css";

function iconStyle(url: string) {
  return {
    "--staff-icon-url": `url("${url}")`,
  } as CSSProperties;
}

export default function FloatingTeamChat() {
  const [isOpen, setIsOpen] = useState(false);
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: ({ signal }) => loadCurrentUser(signal),
    retry: false,
  });
  const canOpenChat = user.data
    ? user.data.isOwner
      || user.data.views.includes("staff")
      || user.data.permissions.some((permission) => permission.module === "chat" && permission.canAccess)
    : false;

  if (!canOpenChat) return null;

  return (
    <aside
      className={`staff-chat ${isOpen ? "staff-chat--open" : ""}`}
      aria-label="Team chat"
    >
      <section className="staff-chat__panel" aria-hidden={!isOpen}>
        <header className="staff-chat__header">
          <div>
            <span className="staff-chat__eyebrow">Vanara team</span>
            <h2>Chat</h2>
          </div>

          <button
            type="button"
            className="staff-chat__close"
            onClick={() => setIsOpen(false)}
            aria-label="Close team chat"
          >
            ×
          </button>
        </header>

        <div className="staff-chat__body">
          <span
            className="staff-chat__body-icon"
            style={iconStyle(wechatIcon)}
            aria-hidden="true"
          >
            <span className="staff-icon" />
          </span>
          <p>Jump into the team thread.</p>
        </div>

        <Link className="staff-chat__open-full" to="/chat" onClick={() => setIsOpen(false)}>
          Open chat
        </Link>
      </section>

      <button
        type="button"
        className="staff-chat__orb"
        aria-label={isOpen ? "Close team chat" : "Open team chat"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span
          className="staff-icon"
          style={iconStyle(wechatIcon)}
          aria-hidden="true"
        />
        <span className="staff-chat__orb-label" aria-hidden="true">Team</span>
      </button>
    </aside>
  );
}
