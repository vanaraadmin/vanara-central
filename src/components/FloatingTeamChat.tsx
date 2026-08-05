import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import TeamChatSurface from "./chat/TeamChatSurface";
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
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartYRef = useRef<number | null>(null);
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

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  function closeOverlay() {
    dragStartYRef.current = null;
    setDragOffset(0);
    setIsOpen(false);
  }

  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    dragStartYRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartYRef.current === null) return;
    setDragOffset(Math.max(0, event.clientY - dragStartYRef.current));
  }

  function handleDragEnd() {
    if (dragOffset > 92) {
      closeOverlay();
      return;
    }
    dragStartYRef.current = null;
    setDragOffset(0);
  }

  if (!canOpenChat) return null;

  return (
    <aside className={`staff-chat ${isOpen ? "staff-chat--open" : ""}`} aria-label="Team chat">
      {isOpen && (
        <div className="staff-chat-overlay" role="dialog" aria-modal="true" aria-label="Team chat app">
          <button
            type="button"
            className="staff-chat-overlay__backdrop"
            onClick={closeOverlay}
            aria-label="Close team chat"
          />
          <section
            className="staff-chat-overlay__sheet"
            style={{ transform: `translate3d(0, ${dragOffset}px, 0)` }}
          >
            <div
              className="staff-chat-overlay__grab-zone"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              <span className="staff-chat-overlay__handle" aria-hidden="true" />
              <button
                type="button"
                className="staff-chat-overlay__close"
                onClick={closeOverlay}
                aria-label="Close team chat"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <TeamChatSurface mode="overlay" />
          </section>
        </div>
      )}

      {!isOpen && (
        <button
          type="button"
          className="staff-chat__orb"
          aria-label="Open team chat"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
        >
          <VanaraChatIcon />
          {badgeLabel && <span className="staff-chat__badge" aria-label={`${badgeLabel} unread team chat alert`}>{badgeLabel}</span>}
        </button>
      )}
    </aside>
  );
}
