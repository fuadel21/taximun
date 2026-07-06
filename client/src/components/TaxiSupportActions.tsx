import { useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";

type SupportRole = "passenger" | "driver";
type SupportKind = "help" | "route" | "call";

export function TaxiSupportActions({ role, rideId }: { role: SupportRole; rideId?: string | null }) {
  const utils = trpc.useUtils();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const label = role === "driver" ? "conductor" : "pasajero";

  const createReport = trpc.system.taxiSafety.createReport.useMutation({
    onSuccess: async () => {
      setNotice("Incidencia registrada correctamente.");
      setError("");
      await utils.system.taxiSafety.getMyReports.invalidate();
      setTimeout(() => setNotice(""), 2600);
    },
    onError: (err) => setError(err.message),
  });

  const create = (kind: SupportKind) => {
    const title = kind === "route" ? "Problema con la ruta" : kind === "call" ? "Solicitar llamada de soporte" : "Solicitud de ayuda";
    createReport.mutate({
      rideId: rideId ?? undefined,
      category: kind === "route" ? "route_issue" : kind === "call" ? "other" : "safety",
      priority: kind === "route" ? "high" : "normal",
      title,
      description: `${label}: ${title}`,
    });
  };

  return (
    <Card className="rounded-[1.75rem] border-white bg-white shadow-lg">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Seguridad y soporte</h2>
            <p className="text-xs font-bold text-slate-500">Centro de ayuda para {label}. Las incidencias quedan guardadas para el administrador.</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-cyan-600" />
        </div>

        {error && <div className="mb-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
        {notice && <div className="mb-3 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}

        <div className="grid grid-cols-3 gap-2">
          <SupportButton icon={<MessageCircle className="h-4 w-4" />} title="Ayuda" loading={createReport.isPending} onClick={() => create("help")} />
          <SupportButton icon={<MapPin className="h-4 w-4" />} title="Ruta" loading={createReport.isPending} onClick={() => create("route")} />
          <SupportButton icon={<Phone className="h-4 w-4" />} title="Llamada" loading={createReport.isPending} onClick={() => create("call")} />
        </div>

        <Button variant="outline" className="mt-3 h-12 w-full rounded-2xl bg-white font-black text-slate-800" disabled={createReport.isPending} onClick={() => create("call")}>
          {createReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
          Solicitar llamada de soporte
        </Button>
      </CardContent>
    </Card>
  );
}

function SupportButton({ icon, title, onClick, loading }: { icon: ReactNode; title: string; onClick: () => void; loading: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className="rounded-2xl bg-slate-50 p-3 text-center text-sm font-black text-slate-700 transition active:scale-95 disabled:opacity-60">
      <span className="mx-auto mb-1 flex justify-center text-cyan-600">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}</span>
      {title}
    </button>
  );
}
