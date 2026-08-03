import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Gift, Loader2, PauseCircle, PlayCircle, PlusCircle } from "lucide-react";

const categories = ["standard", "comfort", "van", "accessible"] as const;
const label: Record<string, string> = { standard: "Turismo", comfort: "Confort", van: "Monovolumen", accessible: "Adaptado" };

export default function AdminPromotionsPage() {
  const list = trpc.system.taxiPromotions.list.useQuery(undefined, { retry: false });
  const create = trpc.system.taxiPromotions.create.useMutation({ onSuccess: async () => list.refetch() });
  const setActive = trpc.system.taxiPromotions.setActive.useMutation({ onSuccess: async () => list.refetch() });
  const [form, setForm] = useState({ code: "", name: "", description: "", discountType: "percent" as "percent" | "fixed", discountValue: "10", maxDiscount: "", minimumSubtotal: "0", startsAt: new Date().toISOString().slice(0, 16), endsAt: "", maxTotalUses: "", maxUsesPerUser: "1", eligibleCategories: [...categories] as string[] });
  const [error, setError] = useState("");
  const promotions = list.data || [];

  const submit = async () => {
    setError("");
    try {
      await create.mutateAsync({
        code: form.code, name: form.name, description: form.description || undefined, discountType: form.discountType,
        discountValue: Number(form.discountValue), maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        minimumSubtotal: Number(form.minimumSubtotal || 0), eligibleCategories: form.eligibleCategories as any,
        startsAt: new Date(form.startsAt).toISOString(), endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        maxTotalUses: form.maxTotalUses ? Number(form.maxTotalUses) : null, maxUsesPerUser: Number(form.maxUsesPerUser || 1), active: true,
      });
      setForm((current) => ({ ...current, code: "", name: "", description: "" }));
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear la promoción."); }
  };

  return <main className="bg-[#f3f3f3] px-4 py-6 text-black"><div className="mx-auto max-w-7xl space-y-5">
    <div><p className="text-sm font-black text-zinc-500">Campañas reales</p><h1 className="text-4xl font-black tracking-tight">Promociones y descuentos</h1><p className="mt-2 font-semibold text-zinc-500">Los códigos se validan en el servidor antes de crear el viaje.</p></div>
    {(error || list.error) && <div className="rounded-3xl bg-red-50 p-4 font-bold text-red-700">{error || list.error?.message}</div>}
    <Card className="rounded-[2rem] border-0 bg-white"><CardContent className="grid gap-4 p-5 lg:grid-cols-2">
      <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Código" className="h-14 rounded-2xl font-black" />
      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre de campaña" className="h-14 rounded-2xl" />
      <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción" className="h-14 rounded-2xl lg:col-span-2" />
      <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as any })} className="h-14 rounded-2xl border px-4 font-bold"><option value="percent">Porcentaje</option><option value="fixed">Importe fijo</option></select>
      <Input type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} placeholder="Descuento" className="h-14 rounded-2xl" />
      <Input type="number" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} placeholder="Descuento máximo opcional" className="h-14 rounded-2xl" />
      <Input type="number" value={form.minimumSubtotal} onChange={(e) => setForm({ ...form, minimumSubtotal: e.target.value })} placeholder="Importe mínimo" className="h-14 rounded-2xl" />
      <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="h-14 rounded-2xl" />
      <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="h-14 rounded-2xl" />
      <Input type="number" value={form.maxTotalUses} onChange={(e) => setForm({ ...form, maxTotalUses: e.target.value })} placeholder="Usos totales opcionales" className="h-14 rounded-2xl" />
      <Input type="number" value={form.maxUsesPerUser} onChange={(e) => setForm({ ...form, maxUsesPerUser: e.target.value })} placeholder="Usos por usuario" className="h-14 rounded-2xl" />
      <div className="lg:col-span-2"><p className="mb-2 text-sm font-black text-zinc-500">Categorías válidas</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{categories.map((category) => { const active = form.eligibleCategories.includes(category); return <button key={category} onClick={() => setForm({ ...form, eligibleCategories: active ? form.eligibleCategories.filter((item) => item !== category) : [...form.eligibleCategories, category] })} className={`h-14 rounded-2xl border font-black ${active ? "bg-black text-white" : "bg-white"}`}>{label[category]}</button>; })}</div></div>
      <Button onClick={submit} disabled={create.isPending || form.eligibleCategories.length === 0} className="h-16 rounded-2xl bg-cyan-600 text-lg font-black text-white lg:col-span-2">{create.isPending ? <Loader2 className="mr-2 animate-spin" /> : <PlusCircle className="mr-2" />}Crear campaña</Button>
    </CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2">{promotions.map((promotion: any) => <Card key={promotion.id} className="rounded-[2rem] border-0 bg-white"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-2xl font-black">{promotion.code}</p><p className="font-bold text-zinc-500">{promotion.name}</p></div><Badge className={promotion.active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"}>{promotion.active ? "Activa" : "Pausada"}</Badge></div><p className="mt-4 text-3xl font-black">{promotion.discount_type === "percent" ? `${promotion.discount_value}%` : `${Number(promotion.discount_value).toFixed(2)} €`}</p><div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-3 text-sm font-bold"><span>Usos: {promotion.usage.uses}</span><span>Descuento: {Number(promotion.usage.discount).toFixed(2)} €</span><span>Por usuario: {promotion.max_uses_per_user}</span><span>Mínimo: {Number(promotion.minimum_subtotal).toFixed(2)} €</span></div><Button onClick={() => setActive.mutate({ id: promotion.id, active: !promotion.active })} disabled={setActive.isPending} variant="outline" className="mt-4 h-14 w-full rounded-2xl font-black">{promotion.active ? <PauseCircle className="mr-2" /> : <PlayCircle className="mr-2" />}{promotion.active ? "Pausar" : "Reactivar"}</Button></CardContent></Card>)}{!list.isLoading && promotions.length === 0 && <div className="rounded-[2rem] bg-white p-8 text-center font-bold text-zinc-500 lg:col-span-2"><Gift className="mx-auto mb-3 h-9 w-9" />Todavía no hay campañas.</div>}</div>
  </div></main>;
}
