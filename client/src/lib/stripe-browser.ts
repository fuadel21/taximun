type StripeCardElement = {
  mount: (target: HTMLElement | string) => void;
  unmount: () => void;
  destroy?: () => void;
};

type StripeElements = {
  create: (type: "card", options?: Record<string, unknown>) => StripeCardElement;
};

type StripePaymentIntent = { status?: string };

type StripeClient = {
  elements: () => StripeElements;
  confirmCardPayment: (
    clientSecret: string,
    data: { payment_method: { card: StripeCardElement } }
  ) => Promise<{ paymentIntent?: StripePaymentIntent; error?: { message?: string } }>;
};

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeClient;
  }
}

let stripeScriptPromise: Promise<void> | null = null;

export function loadStripeBrowser(publishableKey: string): Promise<StripeClient> {
  if (!publishableKey) return Promise.reject(new Error("Falta la clave pública de Stripe."));

  if (window.Stripe) return Promise.resolve(window.Stripe(publishableKey));

  if (!stripeScriptPromise) {
    stripeScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("No se pudo cargar Stripe.js.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar Stripe.js."));
      document.head.appendChild(script);
    });
  }

  return stripeScriptPromise.then(() => {
    if (!window.Stripe) throw new Error("Stripe.js no está disponible.");
    return window.Stripe(publishableKey);
  });
}

export type { StripeCardElement, StripeClient };
