import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";

type SupportRole = "passenger" | "driver";

export function TaxiSupportActions({ role }: { role: SupportRole; rideId?: string | null }) {
  const label = role === "driver" ? "conductor" : "pasajero";

  return (
    <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Seguridad y soporte</h2>
            <p className="text-xs font-bold text-slate-500">Centro de ayuda para {label}.</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-cyan-600" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SupportButton icon={<MessageCircle className="h-4 w-4" />} title="Ayuda" />
          <SupportButton icon={<MapPin className="h-4 w-4" />} title="Ruta" />
          <SupportButton icon={<Phone className="h-4 w-4" />} title="Llamada" />
        </div>

        <Button variant="outline" className="mt-3 h-12 w-full rounded-2xl bg-white font-black text-slate-800">
          <Phone className="mr-2 h-4 w-4" />
          Solicitar llamada de soporte
        </Button>
      </CardContent>
    </Card>
  );
}

function SupportButton({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <button type="button" className="rounded-2xl bg-slate-50 p-3 text-center text-sm font-black text-slate-700 transition active:scale-95">
      <span className="mx-auto mb-1 flex justify-center text-cyan-600">{icon}</span>
      {title}
    </button>
  );
}
