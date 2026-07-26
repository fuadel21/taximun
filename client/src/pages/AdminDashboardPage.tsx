import { AdminCommandGrid } from "@/components/AdminCommandGrid";
import AdminPanel from "./AdminPanel";

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-[#eef6ff]">
      <AdminCommandGrid />
      <AdminPanel />
    </div>
  );
}
