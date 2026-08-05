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
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousBodyOverflow = body.style.overflow;

    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--vc-chat-viewport-height", `${viewportHeight}px`);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeOverlay();
      }
    };

    root.classList.add("vc-chat-overlay-open");
    body.classList.add("vc-chat-overlay-open");
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    updateViewportHeight();
    window.addEventListener("keydown", closeOnEscape);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
      root.classList.remove("vc-chat-overlay-open");
      body.classList.remove("vc-chat-overlay-open");
      root.style.removeProperty("--vc-chat-viewport-height");
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      body.style.overflow = previousBodyOverflow;
      window.scrollTo(0, scrollY);
    };
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
