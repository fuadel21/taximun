import { AdminCommandGrid } from "@/components/AdminCommandGrid";
import { AdminLiveSummary } from "@/components/AdminLiveSummary";

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-white">
      <AdminCommandGrid />
      <AdminLiveSummary />
    </div>
  );
}
