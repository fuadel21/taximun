import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Car, CreditCard, Loader2, Phone, ShieldCheck, Star, UserRound } from "lucide-react";

type ProfileRole = "passenger" | "driver" | "admin";

type TaxiProfileRow = {
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  preferred_payment_method?: string | null;
  rating?: string | number | null;
  completed_rides?: string | number | null;
  favorite_address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  driver_license_number?: string | null;
  taxi_code?: string | null;
  plate?: string | null;
  vehicle_model?: string | null;
  work_zone?: string | null;
  is_verified?: boolean | null;
};

export function TaxiProfileSettings({ role }: { role: ProfileRole }) {
  const utils = trpc.useUtils();
  const profileQuery = trpc.system.taxiProfiles.getMe.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const saveProfile = trpc.system.taxiProfiles.upsertMe.useMutation({
    onSuccess: () => {
      setSaved(true);
      utils.system.taxiProfiles.getMe.invalidate();
      setTimeout(() => setSaved(false), 2200);
    },
    onError: (error) => setError(error.message),
  });

  const profile = (profileQuery.data ?? null) as TaxiProfileRow | null;
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState("cash");
  const [favoriteAddress, setFavoriteAddress] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [driverLicenseNumber, setDriverLicenseNumber] = useState("");
  const [taxiCode, setTaxiCode] = useState("");
  const [plate, setPlate] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [workZone, setWorkZone] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
    setPreferredPaymentMethod(profile.preferred_payment_method ?? "cash");
    setFavoriteAddress(profile.favorite_address ?? "");
    setEmergencyContactName(profile.emergency_contact_name ?? "");
    setEmergencyContactPhone(profile.emergency_contact_phone ?? "");
    setDriverLicenseNumber(profile.driver_license_number ?? "");
    setTaxiCode(profile.taxi_code ?? "");
    setPlate(profile.plate ?? "");
    setVehicleModel(profile.vehicle_model ?? "");
    setWorkZone(profile.work_zone ?? "");
  }, [profile]);

  const submit = async () => {
    setError("");
    if (!fullName.trim()) {
      setError("Introduce tu nombre completo.");
      return;
    }

    await saveProfile.mutateAsync({
      role,
      fullName,
      phone,
      avatarUrl,
      preferredPaymentMethod,
      favoriteAddress,
      emergencyContactName,
      emergencyContactPhone,
      driverLicenseNumber,
      taxiCode,
      plate,
      vehicleModel,
      workZone,
    });
  };

  return (
    <section className="bg-[#f7f8fb] px-4 pb-8 pt-2">
      <Card className="mx-auto max-w-6xl rounded-[1.75rem] border-white bg-white shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl font-black">
                <UserRound className="h-6 w-6 text-cyan-600" /> Perfil real
              </CardTitle>
              <CardDescription>Datos guardados en Supabase para tu cuenta de Taximun.</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge className={profile?.is_verified ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                <ShieldCheck className="mr-1 h-3.5 w-3.5" /> {profile?.is_verified ? "Verificado" : "Pendiente"}
              </Badge>
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                <Star className="mr-1 h-3.5 w-3.5" /> {Number(profile?.rating ?? 5).toFixed(1).replace(".", ",")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {profileQuery.isLoading && (
            <div className="rounded-3xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">Cargando perfil...</div>
          )}

          {error && <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
          {saved && <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Perfil guardado correctamente.</div>}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre completo" icon={<UserRound className="h-4 w-4" />} value={fullName} onChange={setFullName} placeholder="Nombre y apellidos" />
            <Field label="Teléfono" icon={<Phone className="h-4 w-4" />} value={phone} onChange={setPhone} placeholder="+34 600 000 000" />
            <Field label="Avatar URL" icon={<UserRound className="h-4 w-4" />} value={avatarUrl} onChange={setAvatarUrl} placeholder="https://..." />
            <Field label="Pago preferido" icon={<CreditCard className="h-4 w-4" />} value={preferredPaymentMethod} onChange={setPreferredPaymentMethod} placeholder="cash / card / wallet" />
            <Field label="Dirección favorita" icon={<Car className="h-4 w-4" />} value={favoriteAddress} onChange={setFavoriteAddress} placeholder="Casa, trabajo, estación..." />
            <Field label="Contacto emergencia" icon={<ShieldCheck className="h-4 w-4" />} value={emergencyContactName} onChange={setEmergencyContactName} placeholder="Nombre contacto" />
            <Field label="Teléfono emergencia" icon={<Phone className="h-4 w-4" />} value={emergencyContactPhone} onChange={setEmergencyContactPhone} placeholder="+34 600 000 000" />
          </div>

          {role === "driver" && (
            <div className="rounded-[1.5rem] bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Car className="h-5 w-5 text-cyan-600" />
                <h3 className="font-black">Datos profesionales</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Licencia" icon={<ShieldCheck className="h-4 w-4" />} value={driverLicenseNumber} onChange={setDriverLicenseNumber} placeholder="Número de licencia" />
                <Field label="Código taxi" icon={<Car className="h-4 w-4" />} value={taxiCode} onChange={setTaxiCode} placeholder="TX-001" />
                <Field label="Matrícula" icon={<Car className="h-4 w-4" />} value={plate} onChange={setPlate} placeholder="0000-TXM" />
                <Field label="Vehículo" icon={<Car className="h-4 w-4" />} value={vehicleModel} onChange={setVehicleModel} placeholder="Toyota Prius, Mercedes Vito..." />
                <Field label="Zona de trabajo" icon={<Car className="h-4 w-4" />} value={workZone} onChange={setWorkZone} placeholder="Centro, aeropuerto, costa..." />
              </div>
            </div>
          )}

          <Button onClick={submit} disabled={saveProfile.isPending} className="h-14 w-full rounded-3xl bg-slate-950 text-base font-black text-white hover:bg-slate-800">
            {saveProfile.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
            Guardar perfil real
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function Field({ label, icon, value, onChange, placeholder }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-black text-slate-700">{icon}{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-13 rounded-2xl border-slate-100 bg-slate-50 font-bold" />
    </div>
  );
}
