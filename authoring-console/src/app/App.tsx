/**
 * Application composition: theme + query cache + injected services + shell + routes.
 *
 * App assumes a Router ancestor so hosts choose the history strategy (HashRouter for
 * the launcher/static build; MemoryRouter in tests). Services are injected so the app
 * runs identically against fixtures, the launcher API or the direct-browser adapter.
 */
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ThemePreference } from "../contracts/index.ts";
import { ConsoleProvider, type ConsoleServices } from "./ConsoleContext.tsx";
import { ThemeProvider } from "./theme.tsx";
import { AppShell } from "./shell/AppShell.tsx";
import { AppRoutes, type FeatureRoute } from "./routes.tsx";

export interface AppProps {
  readonly services: ConsoleServices;
  readonly featureRoutes?: readonly FeatureRoute[];
  readonly initialThemePreference?: ThemePreference;
  readonly queryClient?: QueryClient;
}

const createDefaultQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      // Reads are safe to retry in production, but tests want determinism; disable
      // automatic retries so a failing fixture surfaces immediately.
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

export const App = ({
  services,
  featureRoutes = [],
  initialThemePreference = "light",
  queryClient,
}: AppProps): ReactNode => {
  const [client] = useState(() => queryClient ?? createDefaultQueryClient());

  return (
    <ThemeProvider initialPreference={initialThemePreference}>
      <QueryClientProvider client={client}>
        <ConsoleProvider services={services}>
          <AppShell>
            <AppRoutes featureRoutes={featureRoutes} />
          </AppShell>
        </ConsoleProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};
