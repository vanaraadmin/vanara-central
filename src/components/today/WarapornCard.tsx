import hero from "../assets/hero.png";

export default function WarapornCard() {
  return (
    <section className="waraporn-card">
      <img
        className="waraporn-image"
        src={hero}
        alt="Waraporn"
      />

      <div className="waraporn-content">
        <div className="waraporn-title">
          <div>
            <h2>Waraporn</h2>
            <small>Your AI Resort Assistant</small>
          </div>

          <button className="ask-button">
            Ask
          </button>
        </div>

        <p>
          Good morning Stefano.
          <br />
          Today you have 2 arrivals, 1 departure and 1 room waiting for
          housekeeping.
        </p>
      </div>
    </section>
  );
}