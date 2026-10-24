import { useEffect } from "react";
import { useLocation } from "wouter";
import { HomeTopBar } from "@/components/HomeTopBar";

export type LegalSection = { heading: string; body: string[] };

export const legalSections: { terms: LegalSection[]; privacy: LegalSection[] } = {
  terms: [
    {
      heading: "1. Objeto del servicio",
      body: [
        "Taximun es una aplicación que conecta a personas que necesitan un servicio de taxi en el área metropolitana de Barcelona con conductores profesionales con licencia de taxi vigente. La prestación del transporte es responsabilidad exclusiva del titular de la licencia y del conductor del vehículo.",
        "Taximun actúa como soporte tecnológico de contratación: calcula el precio del servicio según la tarifa oficial aprobada por la Autoridad del Transporte Metropolitano (AMB) y el IMET, gestiona la asignación del vehículo y facilita el cobro y la emisión de recibos.",
      ],
    },
    {
      heading: "2. Registro y cuentas",
      body: [
        "Para usar el servicio es necesario registrarse con una dirección de correo electrónico válida y ser mayor de 18 años. Los datos facilitados deben ser veraces y actualizados. Cada usuario es responsable de la confidencialidad de sus credenciales de acceso.",
        "La cuenta de conductor requiere además la verificación del número de licencia, del código de taxi y de la matrícula del vehículo antes de poder aceptar servicios.",
      ],
    },
    {
      heading: "3. Precio y forma de pago",
      body: [
        "El precio del servicio contratado a través de la aplicación se calcula conforme a la tarifa T3 (precio cerrado por aplicación) aprobada para el ámbito del AMB, aplicando el tramo horario correspondiente, la distancia estimada, el tiempo de recorrido y los suplementos oficiales que procedan.",
        "El importe se muestra antes de confirmar la solicitud y constituye el precio final del servicio, salvo modificaciones del trayecto a petición del pasajero. El pago puede realizarse en efectivo o, cuando esté disponible, con tarjeta u otros medios digitales.",
        "Al finalizar el servicio se emite un recibo con el número de licencia del titular, la matrícula del vehículo, el origen, el destino, la tarifa aplicada y el desglose del importe, conforme a la normativa del IMET.",
      ],
    },
    {
      heading: "4. Cancelaciones",
      body: [
        "El pasajero puede cancelar el servicio sin coste antes de que el conductor inicie la carrera hacia el punto de recogida. Una vez iniciado el desplazamiento del conductor, la cancelación puede conllevar un cargo equivalente al trayecto ya realizado.",
      ],
    },
    {
      heading: "5. Condiciones de uso del servicio",
      body: [
        "El pasajero se compromete a facilitar una recogida segura, a no exigir trayectos contrarios a la normativa de tráfico y a tratar con respeto al conductor. Los conductores se comprometen a cumplir la normativa del taxi de Barcelona, incluida la obligación de aceptar los servicios que se les asignen por orden de cola cuando estén en servicio.",
      ],
    },
    {
      heading: "6. Responsabilidad",
      body: [
        "Taximun no es transportista. La responsabilidad del transporte recae en el titular de la licencia y en el conductor, que cuentan con el seguro obligatorio vigente. Taximun responderá únicamente de los daños causados directamente por un funcionamiento defectuoso de la aplicación, en la medida prevista por la legislación de consumo aplicable.",
      ],
    },
    {
      heading: "7. Modificaciones",
      body: [
        "Estas condiciones pueden actualizarse para reflejar cambios normativos u operativos. La versión vigente estará siempre disponible en esta página y se notificará a los usuarios cuando el cambio sea sustancial.",
      ],
    },
  ],
  privacy: [
    {
      heading: "1. Responsable del tratamiento",
      body: [
        "El responsable del tratamiento de los datos personales recogidos a través de Taximun es el operador del servicio. Para cualquier ejercicio de derechos puedes escribir a la dirección de contacto que se indica en la aplicación.",
      ],
    },
    {
      heading: "2. Datos que tratamos y finalidad",
      body: [
        "Datos de cuenta (nombre, correo electrónico, rol): crear y gestionar tu acceso a la aplicación.",
        "Datos de perfil de pasajero (direcciones favoritas, métodos de pago): facilitar la contratación de servicios.",
        "Datos de perfil de conductor (nombre, número de licencia, código de taxi, matrícula, modelo de vehículo): verificar tu condición de profesional del taxi y cumplir la normativa del IMET.",
        "Datos de los servicios solicitados (origen, destino, distancia, tarifa, importe, estado): gestionar el servicio, cobrarlo y emitir el recibo conforme a la normativa del taxi de Barcelona.",
        "Datos de localización: durante un servicio activo, tratamos la ubicación del vehículo para mostrarte el estado de la carrera. La ubicación del conductor solo se trata mientras está en cola o en servicio activo.",
        "Datos técnicos y de errores (tipo de navegador, mensajes de error): detectar y corregir fallos de la aplicación. Nunca se asocian a contenidos que uses para elaborar perfiles publicitarios.",
      ],
    },
    {
      heading: "3. Legitimación",
      body: [
        "La base legal es la ejecución del contrato de transporte (datos de cuenta y de servicio), el cumplimiento de obligaciones legales (datos de licencia y recibos) y el interés legítimo en mantener la aplicación funcional y segura (datos técnicos).",
      ],
    },
    {
      heading: "4. Conservación",
      body: [
        "Los datos de cuenta se conservan mientras mantengas el alta en el servicio. Los datos de los servicios (incluido el desglose del recibo) se conservan durante los plazos exigidos por la normativa fiscal y de transporte.",
      ],
    },
    {
      heading: "5. Destinatarios y encargados",
      body: [
        "Utilizamos proveedores tecnológicos que actúan como encargados del tratamiento: alojamiento de la aplicación y de la base de datos (Supabase y Vercel, con servidores en la Unión Europea), y pasarelas de pago certificadas. No cedemos tus datos a terceros con fines publicitarios.",
      ],
    },
    {
      heading: "6. Tus derechos",
      body: [
        "Puedes acceder, rectificar, suprimir, oponerte al tratamiento, limitarlo y solicitar la portabilidad de tus datos escribiendo a la dirección de contacto de la aplicación. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).",
      ],
    },
    {
      heading: "7. Seguridad",
      body: [
        "Aplicamos medidas de seguridad técnicas y organizativas apropiadas: cifrado de las comunicaciones, control de acceso por roles y registro de incidencias. Si detectas una vulnerabilidad, agradeceremos que nos lo comuniques.",
      ],
    },
  ],
};

export function LegalDocument({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="min-h-screen bg-zinc-50">
      <HomeTopBar brand="Taximun" subtitle="Información legal" settingsPath="/auth" settingsLabel="Acceder" />
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <h1 className="text-3xl font-black text-zinc-900">{title}</h1>
        <p className="mt-1 text-sm font-bold text-zinc-500">{updated}</p>
        <div className="mt-6 space-y-6 rounded-[2rem] bg-white p-6 shadow-sm">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-black text-zinc-900">{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} className="mt-2 text-sm leading-6 text-zinc-700">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={() => navigate("/legal/terminos")} className="h-12 flex-1 rounded-2xl bg-white font-black text-zinc-900 shadow-sm">Términos</button>
          <button onClick={() => navigate("/legal/privacidad")} className="h-12 flex-1 rounded-2xl bg-white font-black text-zinc-900 shadow-sm">Privacidad</button>
          <button onClick={() => navigate("/auth")} className="h-12 flex-1 rounded-2xl bg-black font-black text-white shadow-sm">Volver</button>
        </div>
      </div>
    </div>
  );
}
