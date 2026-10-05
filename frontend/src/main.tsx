import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { App } from './App';
import { DebugProvider } from './auth/debug';
import { SessionProvider } from './auth/session';
import { ApiError } from './lib/api';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DebugProvider>
          <SessionProvider>
            <App />
            <Toaster richColors position="top-right" closeButton />
          </SessionProvider>
        </DebugProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
