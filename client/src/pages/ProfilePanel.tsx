import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowLeft, Camera, Car, CheckCircle2, CreditCard, Loader2, Phone, ShieldCheck, UserRound } from "lucide-react";

type ProfileRole = "passenger" | "driver";

export default function ProfilePanel({ role }: { role: ProfileRole }) {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionOk, setSessionOk] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [taxiCode, setTaxiCode] = useState("TX-001");
  const [plate, setPlate] = useState("0000-TXM");
  const [vehicleModel, setVehicleModel] = useState("Toyota Prius");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return;
        const metadata = session.user.user_metadata ?? {};
        if (metadata.role !== role && metadata.role !== "admin") {
          await supabase.auth.updateUser({ data: { role } });
          await supabase.auth.refreshSession();
        }
        if (cancelled) return;
        setSessionOk(true);
        setEmail(session.user.email ?? "");
        setName(metadata.name ?? "");
        setPhone(metadata.phone ?? "");
        setAvatarUrl(metadata.avatar_url ?? "");
        setPaymentMethod(metadata.payment_method ?? "Efectivo");
        setEmergencyContact(metadata.emergency_contact ?? "");
        setTaxiCode(metadata.taxi_code ?? "TX-001");
        setPlate(metadata.plate ?? "0000-TXM");
        setVehicleModel(metadata.vehicle_model ?? "Toyota Prius");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el perfil.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [role]);

  const saveProfile = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const metadata: Record<string, string> = {
        role,
        name,
        phone,
        avatar_url: avatarUrl,
        payment_method: paymentMethod,
        emergency_contact: emergencyContact,
      };
      if (role === "driver") {
        metadata.taxi_code = taxiCode;
        metadata.plate = plate;
        metadata.vehicle_model = vehicleModel;
      }
      const { error: updateError } = await supabase.auth.updateUser({ data: metadata });
      if (updateError) throw updateError;
      await supabase.auth.refreshSession();
      setSuccess("Perfil guardado en Supabase.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const backPath = role === "driver" ? "/driver" : "/passenger";

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-sm rounded-3xl"><CardContent className="flex items-center justify-center gap-3 p-8 font-black text-slate-700"><Loader2 className="h-5 w-5 animate-spin" /> Cargando perfil...</CardContent></Card>
      </main>
    );
  }

  if (!sessionOk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md rounded-3xl">
          <CardHeader><CardTitle className="text-2xl font-black">Sesión necesaria</CardTitle><CardDescription>Inicia sesión para editar tu perfil real.</CardDescription></CardHeader>
          <CardContent><Button onClick={() => setLocation("/auth")} className="w-full rounded-2xl bg-slate-950 font-black text-white">Ir al login</Button></CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef7ff_52%,_#ffffff_100%)] px-4 py-6 text-slate-950">
      <section className="mx-auto max-w-3xl space-y-5 pb-24">
        <div className="flex items-center justify-between gap-3">
          <Button onClick={() => setLocation(backPath)} variant="outline" className="rounded-2xl bg-white font-black"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Perfil real</Badge>
        </div>

        <Card className="overflow-hidden rounded-[2rem] border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl">
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.75rem] bg-white/15 ring-1 ring-white/20">
                {avatarUrl ? <img src={avatarUrl} alt="Perfil" className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10 text-cyan-200" />}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">{role === "driver" ? "Conductor" : "Pasajero"}</p>
                <h1 className="text-3xl font-black">{name || "Tu perfil"}</h1>
                <p className="text-sm font-semibold text-slate-300">{email}</p>
              </div>
            </div>
          </div>

          <CardContent className="space-y-5 p-5">
            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
            {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="mr-2 inline h-4 w-4" />{success}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field icon={<UserRound className="h-4 w-4" />} label="Nombre" value={name} onChange={setName} placeholder="Nombre completo" />
              <Field icon={<Phone className="h-4 w-4" />} label="Teléfono" value={phone} onChange={setPhone} placeholder="+34 600 000 000" />
              <Field icon={<Camera className="h-4 w-4" />} label="URL foto" value={avatarUrl} onChange={setAvatarUrl} placeholder="https://..." />
              <Field icon={<ShieldCheck className="h-4 w-4" />} label="Contacto emergencia" value={emergencyContact} onChange={setEmergencyContact} placeholder="Nombre y teléfono" />
            </div>

            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2"><CreditCard className="h-5 w-5 text-cyan-600" /><h2 className="font-black">Pago preferido</h2></div>
              <div className="grid grid-cols-3 gap-2">
                {['Efectivo', 'Tarjeta', 'Bizum'].map((method) => (
                  <button key={method} onClick={() => setPaymentMethod(method)} className={`rounded-2xl p-3 text-sm font-black ${paymentMethod === method ? 'bg-slate-950 text-white' : 'bg-white text-slate-700'}`}>{method}</button>
                ))}
              </div>
            </div>

            {role === "driver" && (
              <div className="rounded-3xl bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2"><Car className="h-5 w-5 text-cyan-600" /><h2 className="font-black">Vehículo y licencia</h2></div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Código taxi" value={taxiCode} onChange={setTaxiCode} placeholder="TX-001" />
                  <Field label="Matrícula" value={plate} onChange={setPlate} placeholder="0000-TXM" />
                  <Field label="Modelo" value={vehicleModel} onChange={setVehicleModel} placeholder="Toyota Prius" />
                </div>
              </div>
            )}

            <Button onClick={saveProfile} disabled={saving} className="h-14 w-full rounded-3xl bg-gradient-to-r from-cyan-500 to-blue-600 text-base font-black text-white">
              {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
              Guardar perfil real
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Field({ icon, label, value, onChange, placeholder }: { icon?: React.ReactNode; label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 font-black text-slate-800">{icon}<span>{label}</span></Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-12 rounded-2xl bg-white font-semibold" />
    </div>
  );
}
