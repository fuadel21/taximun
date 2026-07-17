import { CheckCircle2, Clock3, LockKeyhole, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  shareUrl: string;
  copied: boolean;
  onShare: () => void;
};

export function TripShareSafetyCard({ shareUrl, copied, onShare }: Props) {
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Sigue mi viaje Taximun en tiempo real: ${shareUrl}`)}`;

  return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
          <LockKeyhole className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black text-emerald-950">Comparte tu viaje con seguridad</p>
          <p className="mt-1 text-xs font-bold text-emerald-800/80">
            El enlace permite ver el taxi y el estado del trayecto. Deja de ser útil cuando termina el viaje.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-emerald-900">
        <div className="rounded-2xl bg-white/80 p-3"><CheckCircle2 className="mr-2 inline h-4 w-4" />Sin iniciar sesión</div>
        <div className="rounded-2xl bg-white/80 p-3"><Clock3 className="mr-2 inline h-4 w-4" />Actualización automática</div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button onClick={onShare} className="h-11 rounded-2xl font-black">
          <Share2 className="mr-2 h-4 w-4" />{copied ? "Enlace copiado" : "Compartir seguimiento"}
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-2xl bg-white font-black text-emerald-800">
          <a href={whatsappUrl} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" />Enviar por WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}
