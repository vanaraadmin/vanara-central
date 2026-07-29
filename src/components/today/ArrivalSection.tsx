import GuestCard from "./GuestCard";
import SectionHeader from "./SectionHeader";

export default function ArrivalSection() {
  return (
    <section className="today-section">
      <SectionHeader title="Arrivals" count={2} />

      <GuestCard
        room="Villa 10"
        guest="Marco Rossi"
        label="Check-in"
        time="15:00"
        status="ready"
      />

      <GuestCard
        room="Bungalow 4"
        guest="Anna Smith"
        label="Check-in"
        time="18:30"
        status="cleaning"
      />
    </section>
  );
}