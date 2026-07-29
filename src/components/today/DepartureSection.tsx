import GuestCard from "./GuestCard";
import SectionHeader from "./SectionHeader";

export default function DepartureSection() {
  return (
    <section className="today-section">
      <SectionHeader title="Departures" count={1} />

      <GuestCard
        room="Bungalow 8"
        guest="John Williams"
        label="Check-out"
        time="11:00"
        status="leaving"
      />
    </section>
  );
}