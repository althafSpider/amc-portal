import { AppSidebar } from "@/components/layout/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { NotificationBell } from "@/components/notifications/notification-dropdown"
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb"
import { PushNotificationsSync } from "@/components/notifications/push-notifications-sync"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PushNotificationsSync />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="relative overflow-hidden bg-background">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.08),transparent_32%)]" />
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-5" />
              <HeaderBreadcrumb />
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <NotificationBell/>
            </div>
          </header>
          <div className="relative flex flex-1 flex-col p-4 sm:p-5 lg:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
