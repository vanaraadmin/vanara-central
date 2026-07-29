import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { loadCurrentUser } from "../services/procurement.service";
import ProcurementOwnerPage from "./ProcurementOwnerPage";
import SupplyRequestPage from "./SupplyRequestPage";

export default function ProcurementPage() {
  const user = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => loadCurrentUser(signal) });
  if (user.isLoading) return <PageLoading />;
  if (user.isError || !user.data) return <PageError onRetry={() => void user.refetch()} />;
  return user.data.isOwner ? <ProcurementOwnerPage /> : <SupplyRequestPage embedded />;
}
