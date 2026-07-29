"use client"

import { usePathname } from "next/navigation"
import { ChevronRight, LayoutDashboard } from "lucide-react"
import Link from "next/link"

const pageTitles: Record<string, { label: string; icon?: React.ElementType }> = {
  "/dashboard": { label: "Dashboard", icon: LayoutDashboard },
  "/clients": { label: "Clients" },
  "/projects": { label: "Projects" },
  "/contracts": { label: "Contracts" },
  "/servers": { label: "Servers" },
  "/domains": { label: "Domains" },
  "/ssl-certificates": { label: "SSL Certificates" },
  "/monitors": { label: "Monitors" },
  "/incidents": { label: "Incidents" },
  "/audit-logs": { label: "Audit Logs" },
  "/expiry-calendar": { label: "Expiry Calendar" },
  "/reminders": { label: "Reminders" },
  "/users": { label: "Users" },
}

export function HeaderBreadcrumb() {
  const pathname = usePathname()

  // Split path into segments, filtering out empty strings
  const segments = pathname.split("/").filter(Boolean)

  // Build breadcrumb trail
  const crumbs: { href: string; label: string; isLast: boolean }[] = []
  let currentPath = ""

  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`
    const isLast = i === segments.length - 1

    // Check if it's a UUID (detail page ID)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segments[i])

    if (isUuid) {
      crumbs.push({
        href: currentPath,
        label: "Details",
        isLast,
      })
    } else {
      const pageTitle = pageTitles[currentPath]?.label ?? segments[i].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      crumbs.push({
        href: currentPath,
        label: pageTitle,
        isLast,
      })
    }
  }

  // If we're on the root, show a default
  if (crumbs.length === 0) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">AMC Portal</p>
        <p className="truncate text-[11px] text-muted-foreground">Management Console</p>
      </div>
    )
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 min-w-0">
        <li className="shrink-0">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 inline-flex"
            aria-label="Dashboard"
          >
            <LayoutDashboard className="size-3.5" />
          </Link>
        </li>
        {crumbs.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" aria-hidden="true" />
            {crumb.isLast ? (
              <span className="truncate text-sm font-semibold text-foreground" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
