"use client";

import {
  LayoutDashboard,
  Users,
  User,
  HardDrive,
  FileText,
  Globe,
  Shield,
  Activity,
  LogOut,
  ChevronRight,
  Megaphone,
  Server,
  AlertTriangle,
  ClipboardList,
  CalendarDays,
  BellRing,
  Settings,
  UserCheck,
} from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  {
    group: "Main",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { title: "Clients", icon: Users, href: "/clients" },
      { title: "Projects", icon: HardDrive, href: "/projects" },
      { title: "Contracts", icon: FileText, href: "/contracts" },
      { title: "Users", icon: User, href: "/users" },
      {
        title: "Expiry Calendar",
        icon: CalendarDays,
        href: "/expiry-calendar",
      },
    ],
  },
  {
    group: "Infrastructure",
    items: [
      { title: "Servers", icon: Server, href: "/servers" },
      { title: "Domains", icon: Globe, href: "/domains" },
      { title: "SSL Certificates", icon: Shield, href: "/ssl-certificates" },
      { title: "Monitors", icon: Activity, href: "/monitors" },
      { title: "Incidents", icon: AlertTriangle, href: "/incidents" },
    ],
  },
  {
    group: "System",
    items: [
      { title: "Global Recipients", icon: UserCheck, href: "/global-notification-users" },
      { title: "Reminders", icon: BellRing, href: "/reminders" },
      { title: "Settings", icon: Settings, href: "/settings" },
      { title: "Audit Logs", icon: ClipboardList, href: "/audit-logs" },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const visibleNavItems = navItems.filter(
    (group) => group.group !== "System" || isAdmin,
  );

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Megaphone className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">AMC Portal</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Management Console
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {visibleNavItems.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Link
                          href={item.href}
                          className={
                            isActive ? "bg-accent text-accent-foreground" : ""
                          }
                        >
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={session?.user?.name ?? "Account"}
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-sidebar-foreground">
                    <Users className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {session?.user?.name ?? "User"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {session?.user?.email ?? ""}
                    </span>
                  </div>
                  <ChevronRight className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
