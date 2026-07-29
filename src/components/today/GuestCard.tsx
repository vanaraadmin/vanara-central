type GuestCardProps = {
  room: string;
 guest: string;
  time: string;
  status: "ready" | "cleaning" | "leaving";
  label: string;
};

export default function GuestCard({
  room,
  guest,
  time,
  status,
  label,
}: GuestCardProps) {
  return (
    <article className="guest-card">
      <div className="guest-main">
        <div>
          <h3>{room}</h3>
          <p>{guest}</p>
        </div>

        <div className={`status ${status}`}></div>
      </div>

      <div className="guest-footer">
        <span>{label}</span>
        <strong>{time}</strong>
      </div>
    </article>
  );
}