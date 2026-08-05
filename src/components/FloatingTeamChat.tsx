import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { loadCurrentUser } from "../services/auth.service";
import { loadChatUnreadSummary } from "../services/chat.service";
import "../styles/FloatingTeamChat.css";

function VanaraChatIcon() {
  return (
    <span className="staff-chat-icon" aria-hidden="true">
      <span className="staff-chat-icon__bubble">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
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
  const summary = useQuery({
    queryKey: ["chat", "summary"],
    queryFn: ({ signal }) => loadChatUnreadSummary(signal),
    enabled: canOpenChat,
    refetchInterval: 45_000,
  });
  const unreadCount = summary.data?.unreadCount ?? 0;
  const mentionCount = summary.data?.mentionCount ?? 0;
  const badgeLabel = mentionCount > 0 ? `@${mentionCount}` : unreadCount > 0 ? String(unreadCount) : "";

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
          <span className="staff-chat__body-icon" aria-hidden="true">
            <VanaraChatIcon />
          </span>
          <p>Team chat is ready.</p>
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
        <VanaraChatIcon />
        <span className="staff-chat__orb-label" aria-hidden="true">Team</span>
        {badgeLabel && <span className="staff-chat__badge" aria-label={`${badgeLabel} unread team chat alert`}>{badgeLabel}</span>}
      </button>
    </aside>
  );
}
