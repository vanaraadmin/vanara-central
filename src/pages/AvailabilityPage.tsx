import WorkspaceShell from "../components/WorkspaceShell";

export default function AvailabilityPage() {
  return (
    <WorkspaceShell title="Availability" workspace="rooms">
      <section className="workspace-placeholder-card">
        <span>Local cache view</span>
        <h2>Availability is not exposed to staff yet.</h2>
        <p>
          The route is ready inside the Vanara workspace framework. Real availability data remains in the local
          backend cache and will be surfaced here when this page enters scope.
        </p>
      </section>
    </WorkspaceShell>
  );
}
