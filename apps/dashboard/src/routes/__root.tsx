import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ConfirmProvider, ToastProvider } from "@/components/ui";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <ToastProvider>
      <ConfirmProvider>
        <Outlet />
      </ConfirmProvider>
    </ToastProvider>
  ),
});
