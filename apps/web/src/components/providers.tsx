'use client';

import { ToastProvider, TooltipProvider } from '@unicrm/ui';
import type { ReactNode } from 'react';
import { ThemeProvider } from './theme-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delay={350}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
