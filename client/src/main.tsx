import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "./lib/trpc";
import { queryClient } from "./_core/queryClient";
import { I18nProvider } from "./contexts/I18nContext";
import { supabase } from "./lib/supabase";

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: undefined,
      async fetch(url: any, options: any) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const headers = new Headers(options?.headers ?? undefined);
        if (session?.access_token) {
          headers.set("Authorization", `Bearer ${session.access_token}`);
        }

        return fetch(url, {
          ...options,
          headers,
          credentials: "include",
        });
      },
    } as any),
  ],
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>
);
