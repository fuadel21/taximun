import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, Loader2, Search, ShieldCheck, UserCheck, XCircle } from "lucide-react";

type DriverVerificationRow = {
  user_id: string;
  full_name?: string | null;
  phone?: string | null;
  taxi_code?: string | null;
  plate?: string | null;
  vehicle_model?: string | null;
  work_zone?: string | null;
  is_verified?: boolean | null;
  verification_status?: "pending" | "in_review" | "approved" | "rejected" | null;
  verification_note?: string | null;
  total_documents?: number | string | null;
  approved_documents?: number | string | null;
  pending_documents?: number | string | null;
  rejected_documents?: number | string | null;
};

type DriverDocumentRow = {
  id: string;
  driver_id: string;
  document_type: string;
  title?: string | null;
  document_number?: string | null;
  file_url?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  rejection_reason?: string | null;
  created_at?: string | null;
};

const documentLabels: Record<string, string> = {
  identity: "Identidad",
  driver_license: "Permiso conducir",
  taxi_license: "Licencia taxi",
  insurance: "Seguro",
  vehicle_inspection: "Inspección / ITV",
  other: "Otro",
};

function statusBadge(status?: string | null, isVerified?: boolean | null) {
  if (isVerified || status === "approved") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Aprobado</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rechazado</Badge>;
  if (status === "in_review") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">En revisión</Badge>;
  if (status === "expired") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Caducado</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Pendiente</Badge>;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES");
}

export default function AdminVerificationPage() {
  const [, setLocation] = useLocation();
  const { user, isGuest } = useAuth() as any;
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("Documentación revisada por administración.");
  const isRealAdmin = !isGuest && user?.role === "admin";

  const verificationQuery = trpc.system.taxiProfiles.adminListDriverDocuments.useQuery(undefined, {
    enabled: isRealAdmin,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const invalidate = () => utils.system.taxiProfiles.adminListDriverDocuments.invalidate();
  const verifyUser = trpc.system.taxiProfiles.adminVerifyUser.useMutation({ onSuccess: invalidate });
  const reviewDocument = trpc.system.taxiProfiles.adminReviewDriverDocument.useMutation({ onSuccess: invalidate });

  const drivers = (verificationQuery.data?.drivers ?? []) as DriverVerificationRow[];
  const documents = (verificationQuery.data?.documents ?? []) as DriverDocumentRow[];
  const documentsByDriver = useMemo(() => {
    return documents.reduce<Record<string, DriverDocumentRow[]>>((acc, item) => {
      acc[item.driver_id] = [...(acc[item.driver_id] ?? []), item];
      return acc;
    }, {});
  }, [documents]);

  const filteredDrivers = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return drivers;
    return drivers.filter((driver) =>
      [driver.full_name, driver.phone, driver.taxi_code, driver.plate, driver.work_zone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text))
    );
  }, [drivers, query]);

  const pendingDrivers = drivers.filter((driver) => !driver.is_verified).length;
  const pendingDocs = documents.filter((doc) => doc.status === "pending").length;
  const approvedDrivers = drivers.filter((driver) => driver.is_verified).length;
  const isSaving = verifyUser.isPending || reviewDocument.isPending;

  const approveDriver = (driverId: string) => {
    verifyUser.mutate({ userId: driverId, isVerified: true, note });
  };

  const rejectDriver = (driverId: string) => {
    verifyUser.mutate({ userId: driverId, isVerified: false, note: note || "Documentación insuficiente." });
  };

  if (!isRealAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md rounded-3xl">
          <CardContent className="space-y-4 p-8 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-cyan-600" />
            <h1 className="text-2xl font-black">Acceso admin requerido</h1>
            <p className="text-sm font-semibold text-slate-500">Entra con una cuenta administradora para revisar conductores.</p>
            <Button onClick={() => setLocation("/admin")} className="rounded-2xl bg-slate-950 font-black text-white">Volver al admin</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_45%,_#ffffff_100%)] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 shadow-sm backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setLocation("/admin")} className="rounded-2xl bg-white/80">
              <ArrowLeft className="mr-2 h-4 w-4" /> Admin
            </Button>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Taximun compliance</p>
              <h1 className="text-xl font-black leading-tight sm:text-2xl">Verificación de conductores</h1>
            </div>
          </div>
          {isSaving && <Badge variant="outline">Guardando...</Badge>}
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {verificationQuery.error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            <AlertCircle className="mr-2 inline h-4 w-4" /> {verificationQuery.error.message}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Metric icon={<UserCheck className="h-5 w-5" />} title="Conductores pendientes" value={String(pendingDrivers)} />
          <Metric icon={<FileText className="h-5 w-5" />} title="Documentos pendientes" value={String(pendingDocs)} />
          <Metric icon={<ShieldCheck className="h-5 w-5" />} title="Conductores aprobados" value={String(approvedDrivers)} />
        </div>

        <Card className="rounded-[1.75rem] border-white bg-white/90 shadow-xl backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="h-5 w-5 text-cyan-600" /> Cola de revisión</CardTitle>
            <CardDescription>Aprueba perfiles solo cuando licencia, seguro e inspección estén correctos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, matrícula, zona..." className="h-12 rounded-2xl bg-white pl-9 font-bold" />
              </div>
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota de revisión" className="h-12 rounded-2xl bg-white font-bold" />
            </div>

            {verificationQuery.isLoading ? (
              <div className="rounded-3xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Cargando revisión...</div>
            ) : (
              <div className="space-y-4">
                {filteredDrivers.map((driver) => {
                  const driverDocs = documentsByDriver[driver.user_id] ?? [];
                  return (
                    <div key={driver.user_id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-black">{driver.full_name ?? "Conductor"}</h2>
                            {statusBadge(driver.verification_status, driver.is_verified)}
                          </div>
                          <p className="mt-1 text-sm font-bold text-slate-500">
                            {driver.taxi_code ?? "Sin taxi"} · {driver.plate ?? "Sin matrícula"} · {driver.work_zone ?? "Sin zona"}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            Documentos: {Number(driver.approved_documents ?? 0)} aprobados · {Number(driver.pending_documents ?? 0)} pendientes · {Number(driver.rejected_documents ?? 0)} rechazados
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button disabled={isSaving} onClick={() => approveDriver(driver.user_id)} className="rounded-2xl bg-emerald-600 font-black text-white hover:bg-emerald-500">
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Aprobar conductor
                          </Button>
                          <Button disabled={isSaving} onClick={() => rejectDriver(driver.user_id)} variant="outline" className="rounded-2xl border-red-200 bg-white font-black text-red-700 hover:bg-red-50">
                            <XCircle className="mr-2 h-4 w-4" /> Rechazar
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Documento</TableHead>
                              <TableHead>Número</TableHead>
                              <TableHead>Caducidad</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead className="text-right">Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {driverDocs.map((doc) => (
                              <TableRow key={doc.id}>
                                <TableCell className="font-bold">
                                  <div>{doc.title || documentLabels[doc.document_type] || doc.document_type}</div>
                                  {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-xs font-black text-cyan-700 underline">Abrir archivo</a>}
                                </TableCell>
                                <TableCell>{doc.document_number || "—"}</TableCell>
                                <TableCell>{dateLabel(doc.expires_at)}</TableCell>
                                <TableCell>{statusBadge(doc.status)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" disabled={isSaving} onClick={() => reviewDocument.mutate({ documentId: doc.id, status: "approved" })} className="rounded-xl bg-emerald-600 font-black text-white hover:bg-emerald-500">Aprobar</Button>
                                    <Button size="sm" disabled={isSaving} onClick={() => reviewDocument.mutate({ documentId: doc.id, status: "rejected", rejectionReason: note || "Revisar documento" })} variant="outline" className="rounded-xl border-red-200 text-red-700">Rechazar</Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {driverDocs.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="py-6 text-center text-sm font-bold text-slate-500">Este conductor todavía no ha enviado documentos.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })}

                {filteredDrivers.length === 0 && (
                  <div className="rounded-3xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">No hay conductores en revisión.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Metric({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <Card className="rounded-[1.5rem] border-white bg-white/90 shadow-lg backdrop-blur-xl">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <p className="mt-1 text-3xl font-black">{value}</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">{icon}</div>
      </CardContent>
    </Card>
  );
}
