import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { loadCurrentUser } from "../services/procurement.service";
import ProcurementOwnerPage from "./ProcurementOwnerPage";
import SupplyRequestPage from "./SupplyRequestPage";

export default function ProcurementPage() {
  const user = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => loadCurrentUser(signal) });
  if (user.isLoading) return <WorkspaceShell title="Procurement" workspace="procurement"><PageLoading /></WorkspaceShell>;
  if (user.isError || !user.data) return <WorkspaceShell title="Procurement" workspace="procurement"><PageError onRetry={() => void user.refetch()} /></WorkspaceShell>;
  return user.data.isOwner ? (
    <ProcurementOwnerPage />
  ) : (
    <WorkspaceShell title="Procurement" workspace="procurement">
      <SupplyRequestPage embedded />
    </WorkspaceShell>
  );
}
