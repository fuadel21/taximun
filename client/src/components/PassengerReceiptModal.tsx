import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ReceiptText, X } from "lucide-react";

type ReceiptRide = {
  id: string;
  status: string;
  requested_at?: string | null;
  completed_at?: string | null;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number | string;
  estimated_duration: number | string;
  estimated_fare: number | string;
  final_fare?: number | string | null;
  payment_method?: string | null;
  driver_name?: string | null;
  taxi_code?: string | null;
  plate?: string | null;
  fare_breakdown?: Record<string, any> | null;
  quote_version?: string | null;
};

type ReceiptDriver = {
  full_name?: string | null;
  driver_license_number?: string | null;
  taxi_code?: string | null;
  plate?: string | null;
  vehicle_model?: string | null;
} | null;

const money = (value: unknown) => `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} €`;
const paymentLabel = (value?: string | null) => (value === "card" ? "Tarjeta" : value === "bizum" ? "Bizum" : "Efectivo");

/**
 * Recibo imprimible del servicio, conforme a la regla 22 de la tarifa T3 del
 * IMET: nº de servicio, fecha y hora, origen y destino, tarifa aplicada,
 * desglose e importe, con licencia, taxi y conductor.
 */
export function PassengerReceiptModal({ rideId, onClose }: { rideId: string; onClose: () => void }) {
  const receipt = trpc.system.taxiPassengerTracking.getRideReceipt.useQuery(
    { rideId },
    { retry: false },
  );

  const ride = (receipt.data as any)?.ride as ReceiptRide | undefined;
  const driverProfile = (receipt.data as any)?.driverProfile as ReceiptDriver;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
        {receipt.isLoading && <p className="py-10 text-center font-bold text-zinc-500"><Loader2 className="mr-2 inline animate-spin" />Preparando recibo…</p>}
        {receipt.error && (
          <div>
            <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{receipt.error.message}</p>
            <Button onClick={onClose} variant="outline" className="mt-3 h-12 w-full rounded-2xl font-black">Cerrar</Button>
          </div>
        )}

        {ride && (
          <>
            <div className="flex items-start justify-between">
              <p className="flex items-center gap-2 text-lg font-black"><ReceiptText className="h-6 w-6" />Recibo de servicio</p>
              <button onClick={onClose} aria-label="Cerrar recibo" className="rounded-xl bg-zinc-100 p-2 hover:bg-zinc-200"><X className="h-5 w-5" /></button>
            </div>

            <div className="taximun-receipt-print mt-4 rounded-3xl border border-zinc-200 p-5 text-black">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                <div>
                  <p className="text-xl font-black">Taximun</p>
                  <p className="text-xs font-bold text-zinc-500">Servicio de taxi · Área Metropolitana de Barcelona</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-zinc-500">Factura simplificada</p>
                  <p className="text-xs font-bold text-zinc-500">Nº {ride.id.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>

              <div className="space-y-1 border-b border-zinc-200 py-4 text-sm font-bold">
                <p>Fecha: {new Date(ride.completed_at || ride.requested_at || Date.now()).toLocaleString("es-ES")}</p>
                <p>Origen: {ride.pickup_address}</p>
                <p>Destino: {ride.dropoff_address}</p>
                <p>Tarifa aplicada: {ride.fare_breakdown?.tariffLabel || ride.quote_version || "Tarifa oficial AMB"}</p>
              </div>

              <div className="space-y-1 border-b border-zinc-200 py-4 text-sm font-bold">
                <p>Distancia: {Number(ride.distance_km).toFixed(1)} km · Tiempo: {ride.estimated_duration} min</p>
                <p>Conductor: {driverProfile?.full_name || ride.driver_name || "—"}</p>
                <p>Taxi: {driverProfile?.taxi_code || ride.taxi_code || "—"} · Matrícula: {driverProfile?.plate || ride.plate || "—"}</p>
                <p>Licencia: {driverProfile?.driver_license_number || "—"}</p>
              </div>

              <div className="space-y-1.5 py-4 text-sm font-bold">
                <div className="flex justify-between"><span>Bajada de bandera</span><span>{money(ride.fare_breakdown?.baseFare)}</span></div>
                <div className="flex justify-between"><span>Recorrido ({Number(ride.distance_km).toFixed(1)} km)</span><span>{money(ride.fare_breakdown?.distanceFare)}</span></div>
                {Number(ride.fare_breakdown?.timeFare || 0) > 0 && (
                  <div className="flex justify-between"><span>Tiempo con tráfico{ride.fare_breakdown?.timeMinutes != null ? ` (${ride.fare_breakdown.timeMinutes} min)` : ""}</span><span>{money(ride.fare_breakdown?.timeFare)}</span></div>
                )}
                {(ride.fare_breakdown?.supplements || []).map((item: { code: string; label: string; amount: number }) => (
                  <div key={item.code} className="flex justify-between"><span>{item.label}</span><span>{money(item.amount)}</span></div>
                ))}
                {!(ride.fare_breakdown?.supplements || []).length && Number(ride.fare_breakdown?.airportSupplement || 0) > 0 && (
                  <div className="flex justify-between"><span>Suplemento aeropuerto</span><span>{money(ride.fare_breakdown?.airportSupplement)}</span></div>
                )}
                {Number(ride.fare_breakdown?.bookingFee || 0) > 0 && (
                  <div className="flex justify-between"><span>Cargo de servicio</span><span>{money(ride.fare_breakdown?.bookingFee)}</span></div>
                )}
                {Number(ride.fare_breakdown?.discount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-700"><span>Descuento {ride.fare_breakdown?.promoCode ? `(${ride.fare_breakdown.promoCode})` : ""}</span><span>−{money(ride.fare_breakdown?.discount)}</span></div>
                )}
                <div className="mt-2 flex justify-between border-t border-zinc-300 pt-3 text-lg font-black"><span>Total</span><span>{money(ride.final_fare ?? ride.estimated_fare)}</span></div>
                <p className="text-xs font-bold text-zinc-500">Forma de pago: {paymentLabel(ride.payment_method)}</p>
              </div>

              <p className="border-t border-dashed border-zinc-300 pt-3 text-center text-[10px] font-bold text-zinc-400">
                Servicio contratado por aplicación · Precio cerrado T3 (AMB · IMET) · Guarde este recibo como justificante
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button onClick={() => window.print()} className="h-14 rounded-2xl bg-black font-black text-white"><Printer className="mr-2 h-5 w-5" />Imprimir / PDF</Button>
              <Button onClick={onClose} variant="outline" className="h-14 rounded-2xl font-black">Cerrar</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
