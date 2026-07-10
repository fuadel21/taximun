import { useLocation } from "wouter";
import { TaxiNotificationCenter } from "@/components/TaxiNotificationCenter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Bell } from "lucide-react";

export default function NotificationsPage() {
  const [, setLocation] = useLocation();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_45%,_#ffffff_100%)] p-4 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3 py-2">
          <Button variant="outline" onClick={() => window.history.back()} className="rounded-2xl bg-white/80 font-black">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
          <TaxiNotificationCenter />
        </div>

        <Card className="rounded-[1.75rem] border-white bg-white/90 shadow-xl backdrop-blur-xl">
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-50 text-cyan-700">
              <Bell className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-black">Centro de notificaciones</h1>
            <p className="text-sm font-bold text-slate-500">
              Pulsa el botón “Avisos” para abrir tu bandeja interna. Aquí verás aprobaciones, rechazos, documentos enviados y avisos de administración.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
