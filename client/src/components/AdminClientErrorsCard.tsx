import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

type ClientError = {
  id: string;
  user_id: string | null;
  user_role: string | null;
  message: string;
  stack: string | null;
  source_url: string | null;
  occurred_at: string;
  resolved: boolean;
};

/**
 * Monitorización propia: últimos errores capturados en los navegadores de
 * usuarios autenticados (pasajeros, conductores y admin), con resolución.
 */
export function AdminClientErrorsCard() {
  const query = trpc.system.taxiSystemHealth.listClientErrors.useQuery({ limit: 30 }, { retry: false, refetchInterval: 30000 });
  const resolve = trpc.system.taxiSystemHealth.resolveClientError.useMutation({ onSuccess: async () => query.refetch() });
  const errors = (query.data || []) as ClientError[];
  const pending = errors.filter((item) => !item.resolved);

  return (
    <div className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-lg font-black"><TriangleAlert className="h-5 w-5 text-amber-600" />Errores de navegador</p>
          <p className="mt-1 text-sm font-semibold text-zinc-500">Telemetría de las apps de pasajero, conductor y admin (últimos 30).</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={pending.length ? "bg-red-600 hover:bg-red-600" : "bg-emerald-600 hover:bg-emerald-600"}>{pending.length ? `${pending.length} sin revisar` : "Sin errores pendientes"}</Badge>
          <Button onClick={() => query.refetch()} disabled={query.isFetching} variant="outline" className="h-12 rounded-2xl font-black">{query.isFetching ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}</Button>
        </div>
      </div>

      {query.isLoading && <p className="mt-4 text-sm font-bold text-zinc-400"><Loader2 className="mr-2 inline animate-spin" />Cargando telemetría…</p>}
      {!query.isLoading && errors.length === 0 && (
        <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><ShieldCheck className="mr-2 inline h-5 w-5" />No se han registrado errores de navegador.</p>
      )}

      {errors.length > 0 && (
        <div className="mt-4 space-y-2">
          {errors.map((item) => (
            <div key={item.id} className={`rounded-2xl border p-3 ${item.resolved ? "border-zinc-100 bg-zinc-50 opacity-60" : "border-red-100 bg-red-50/50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-zinc-900">{item.message}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-500">
                    {new Date(item.occurred_at).toLocaleString("es-ES")} · {item.user_role || "sin rol"}{item.source_url ? ` · ${item.source_url}` : ""}
                  </p>
                </div>
                {!item.resolved && (
                  <Button onClick={() => resolve.mutate({ id: item.id })} disabled={resolve.isPending} variant="outline" className="h-9 rounded-xl bg-white px-3 text-xs font-black">
                    {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Marcar revisado"}
                  </Button>
                )}
              </div>
              {item.stack && <details className="mt-2"><summary className="cursor-pointer text-xs font-black text-zinc-500">Traza</summary><pre className="mt-1 max-h-40 overflow-auto rounded-xl bg-zinc-900 p-3 text-[10px] leading-relaxed text-zinc-200">{item.stack}</pre></details>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
