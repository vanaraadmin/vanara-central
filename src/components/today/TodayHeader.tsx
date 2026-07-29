export default function TodayHeader() {
  return (
    <header className="today-header">
      <div>
        <h1>Today</h1>
        <p>Monday, 27 July 2026</p>
      </div>

      <div className="day-navigation">
        <button>{"←"}</button>
        <button>📅</button>
        <button>{"→"}</button>
      </div>
    </header>
  );
}