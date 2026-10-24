import { AdminCommandGrid } from "@/components/AdminCommandGrid";
import { AdminLiveSummary } from "@/components/AdminLiveSummary";
import { HomeTopBar } from "@/components/HomeTopBar";

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-white">
      <HomeTopBar brand="Taximun Admin" subtitle="Centro de mando" />
      <AdminCommandGrid />
      <AdminLiveSummary />
    </div>
  );
}
