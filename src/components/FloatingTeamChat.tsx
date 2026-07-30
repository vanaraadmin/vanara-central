import { useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import wechatIcon from "../assets/img/wechat-logo-light.svg";
import "../styles/FloatingTeamChat.css";

function iconStyle(url: string) {
  return {
    "--staff-icon-url": `url("${url}")`,
  } as CSSProperties;
}

export default function FloatingTeamChat() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside
      className={`staff-chat ${isOpen ? "staff-chat--open" : ""}`}
      aria-label="Team chat"
    >
      <section className="staff-chat__panel" aria-hidden={!isOpen}>
        <header className="staff-chat__header">
          <div>
            <span className="staff-chat__eyebrow">Vanara Central</span>
            <h2>Team chat</h2>
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
          <p>Open the live team conversation.</p>
        </div>

        <Link className="staff-chat__open-full" to="/chat" onClick={() => setIsOpen(false)}>
          Open team chat
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
      </button>
    </aside>
  );
}
