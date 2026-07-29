"use client"

import { useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useMonitor, useMonitorChecks, useTriggerCheck, useUpdateMonitor } from "@/hooks/use-monitors"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { MonitorCheckHistory } from "@/components/monitors/monitor-check-history"
import { MonitorEditDrawer } from "@/components/monitors/monitor-edit-drawer"
import { BackButton } from "@/components/common/back-button"
import Link from "next/link"
import {
  Activity,
  Play,
  Clock,
  Target,
  Globe,
  Pencil,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  Gauge,
  Users,
} from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts"
import { useState } from "react"
import { format } from "date-fns"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils"
import type { MonitorCurrentStatus, MonitorCheckType, AccountManager } from "@/types/api"
import { formatInterval } from "@/lib/format-utils"

const STATUS_CONFIG: Record<MonitorCurrentStatus, { color: "emerald" | "red" | "gray"; label: string }> = {
  up: { color: "emerald", label: "Up" },
  down: { color: "red", label: "Down" },
  unknown: { color: "gray", label: "Unknown" },
}

const TYPE_LABELS: Record<MonitorCheckType, string> = {
  http: "HTTP",
  https: "HTTPS",
  tcp: "TCP",
  ping: "Ping",
  keyword: "Keyword",
}

export default function MonitorDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { data: monitor, isLoading, isError } = useMonitor(id)
  const { data: checksData, isLoading: checksLoading } = useMonitorChecks(id)
  const { mutate: triggerCheck, isPending: isChecking } = useTriggerCheck()
  const { mutate: updateMonitor, isPending: isUpdating } = useUpdateMonitor()

  const [editOpen, setEditOpen] = useState(false)

  const handleEditSubmit = useCallback(
    (data: { name?: string; check_type?: string; target?: string; interval_seconds?: number; enabled?: boolean }) => {
      const payload: Record<string, unknown> = { ...data }
      if (data.check_type) payload.check_type = data.check_type
      updateMonitor({ id, ...payload } as Parameters<typeof updateMonitor>[0], { onSuccess: () => setEditOpen(false) })
    },
    [id, updateMonitor]
  )

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-7xl">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-96" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
            <div className="lg:col-span-2">
              <Skeleton className="h-40 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isError || !monitor) {
    return (
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="flex flex-col items-center justify-center text-center gap-4">
          <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Activity className="size-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Monitor not found</h2>
          <p className="text-muted-foreground max-w-sm">
            The monitor you&apos;re looking for doesn&apos;t exist or may have been removed.
          </p>
          <BackButton variant="outline" label="Back to Monitors" fallbackHref="/monitors" />
        </div>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[monitor.current_status]

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Back + Header */}
      <div className="mb-6">
        <BackButton fallbackHref="/monitors" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight truncate">{monitor.name}</h1>
              <Badge variant="dot" size="sm" color={statusCfg.color}>
                {statusCfg.label}
              </Badge>
            </div>
            <p className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Globe className="size-4 shrink-0" />
              <Link href={`${monitor.target}`} target="_blank">
                <span className="font-mono text-sm truncate">{monitor.target}</span>
              </Link> 
              <span className="text-muted-foreground/50 mx-1">·</span>
              <span>{TYPE_LABELS[monitor.check_type]}</span>
              {monitor.asset_id && monitor.asset_name && (
                <>
                  <span className="text-muted-foreground/50 mx-1">·</span>
                  <Link
                    href={`/projects/${monitor.asset_id}`}
                    className="hover:text-foreground hover:underline underline-offset-2 transition-colors"
                  >
                    {monitor.asset_name}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => triggerCheck(monitor.id)} disabled={isChecking}>
              {isChecking ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Play className="size-3.5 mr-1.5" />}
              Check Now
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5 mr-1.5" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Stats Bar */}
      {(() => {
        const checks = checksData?.data ?? []
        const totalChecks = checks.length
        const upChecks = checks.filter(c => c.status === 'up').length
        const downChecks = checks.filter(c => c.status === 'down').length
        const avgResponseMs = checks.length > 0
          ? Math.round(checks.reduce((sum, c) => sum + (c.response_time_ms ?? 0), 0) / checks.length)
          : 0
        const uptimePct = totalChecks > 0 ? Math.round((upChecks / totalChecks) * 100) : 0

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-border/50 bg-card p-3.5 hover:border-primary/20 hover:bg-accent/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Uptime</p>
                  <p className="text-lg font-bold tabular-nums tracking-tight">{uptimePct}%</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-3.5 hover:border-primary/20 hover:bg-accent/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
                  <Zap className="size-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Avg Response</p>
                  <p className="text-lg font-bold tabular-nums tracking-tight">{avgResponseMs}ms</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-3.5 hover:border-primary/20 hover:bg-accent/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center shrink-0">
                  <Activity className="size-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Total Checks</p>
                  <p className="text-lg font-bold tabular-nums tracking-tight">{totalChecks}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-3.5 hover:border-primary/20 hover:bg-accent/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center shrink-0">
                  <Gauge className="size-4 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Success Rate</p>
                  <p className="text-lg font-bold tabular-nums tracking-tight">{totalChecks > 0 ? Math.round((upChecks / totalChecks) * 100) : 0}%</p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Config Details */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="size-4" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {/* Target - full width */}
                <div className="sm:col-span-2 flex items-start gap-3 p-3 rounded-lg bg-muted/30 -mx-1">
                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Globe className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium">Target</p>
                    <Link href={`${monitor.target}`} target="_blank">
                      <p className="text-sm font-mono truncate">{monitor.target}</p>
                    </Link>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
                    <Activity className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">Check Type</p>
                    <p className="text-sm">{TYPE_LABELS[monitor.check_type]}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
                    <Clock className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">Interval</p>
                    <p className="text-sm">
                      {formatInterval(monitor.interval_seconds)}
                    </p>
                  </div>
                </div>

                {monitor.expected_status_code !== null && (
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
                      <Target className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Expected Status</p>
                      <p className="text-sm font-mono">{monitor.expected_status_code}</p>
                    </div>
                  </div>
                )}

                {monitor.expected_keyword && (
                  <div className="sm:col-span-2 flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
                      <Activity className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Expected Keyword</p>
                      <p className="text-sm font-mono">{monitor.expected_keyword}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Checks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4" />
                Recent Checks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {checksLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <MonitorCheckHistory checks={checksData?.data ?? []} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Status & Checks */}
        <div className="lg:col-span-2 space-y-4">
          {/* Status Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="size-4" />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Current Status */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground font-medium">Current</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    statusCfg.color === 'emerald'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                      : statusCfg.color === 'red'
                        ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    <span className={`size-1.5 rounded-full ${
                      statusCfg.color === 'emerald'
                        ? 'bg-emerald-500 animate-pulse'
                        : statusCfg.color === 'red'
                          ? 'bg-red-500'
                          : 'bg-muted-foreground/40'
                    }`} />
                    {statusCfg.label}
                  </span>
                </div>
                {/* Visual status bar */}
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      statusCfg.color === 'emerald' ? 'w-full bg-emerald-400'
                      : statusCfg.color === 'red' ? 'w-full bg-red-400'
                      : 'w-1/3 bg-muted-foreground/30'
                    }`}
                  />
                </div>
              </div>

              <div className="border-t border-border/40 pt-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Enabled</span>
                  {monitor.enabled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-3" />
                      Yes
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <XCircle className="size-3" />
                      No
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Checked</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {monitor.last_checked_at
                      ? format(new Date(monitor.last_checked_at), "MMM d, HH:mm")
                      : "Never"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Project</span>
                  {monitor.asset_id && monitor.asset_name ? (
                    <Link
                      href={`/projects/${monitor.asset_id}`}
                      className="text-xs truncate max-w-[130px] font-medium hover:text-foreground hover:underline underline-offset-2 transition-colors"
                    >
                      {monitor.asset_name}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground truncate max-w-[130px] font-medium">
                      {monitor.asset_name || "—"}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <span className="inline-flex items-center rounded-md border border-border/50 bg-accent/30 px-1.5 py-0.5 text-[10px] font-mono font-medium">
                    {TYPE_LABELS[monitor.check_type]}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
       {/* Account Managers Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Users className="size-3.5 text-muted-foreground" />
                Account Managers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monitor.account_managers.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Users className="size-6 mx-auto mb-1.5 opacity-30" />
                  <p className="text-xs">No managers assigned to this client</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {monitor.account_managers.map((manager: AccountManager) => (
                    <div
                      key={manager.id}
                      className="flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-accent/50"
                    >
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                          {getInitials(manager.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{manager.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{manager.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {/* Check Distribution Mini Card */}
          {(() => {
            const checks = checksData?.data ?? []
            const upChecks = checks.filter(c => c.status === 'up').length
            const downChecks = checks.filter(c => c.status === 'down').length
            const unknownChecks = checks.filter(c => c.status === 'unknown').length
            const total = checks.length

            if (total === 0) return null

            const chartConfig = {
              up: { label: "Up", color: "#22c55e" },
              down: { label: "Down", color: "#ef4444" },
              unknown: { label: "Unknown", color: "#9ca3af" },
            }

            const chartData = [
              { name: "Up", value: upChecks, fill: "var(--color-up)" },
              { name: "Down", value: downChecks, fill: "var(--color-down)" },
              { name: "Unknown", value: unknownChecks, fill: "var(--color-unknown)" },
            ].filter(d => d.value > 0)

            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="size-3.5 text-muted-foreground" />
                    Check Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ChartContainer
                    config={chartConfig}
                    initialDimension={{ width: 240, height: chartData.length * 24 + 10 }}
                    className="w-full [&_.recharts-surface]:overflow-visible"
                  >
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 0, right: 28, bottom: 0, left: 52 }}
                      barSize={14}
                      barGap={4}
                    >
                      <XAxis type="number" hide domain={[0, Math.max(1, ...chartData.map(d => d.value))]} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            hideLabel
                            formatter={(value: unknown) => {
                              const count = typeof value === 'number' ? value : 0
                              return <span className="font-semibold text-foreground tabular-nums">{count} check{count !== 1 ? 's' : ''}</span>
                            }}
                          />
                        }
                      />
                      <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>

                  <div className="flex items-center justify-center gap-3 text-xs">
                    {upChecks > 0 && (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        {upChecks} up
                      </span>
                    )}
                    {downChecks > 0 && (
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                        <span className="size-2 rounded-full bg-red-500" />
                        {downChecks} down
                      </span>
                    )}
                    {unknownChecks > 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <span className="size-2 rounded-full bg-gray-400" />
                        {unknownChecks} unknown
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })()}

   
        </div>
      </div>

      {/* Edit Drawer */}
      <MonitorEditDrawer
        key={`edit-${editOpen}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleEditSubmit}
        isPending={isUpdating}
        monitor={monitor}
      />
    </div>
  )
}
