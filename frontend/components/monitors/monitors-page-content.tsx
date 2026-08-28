"use client"

import { useCallback, useState, useEffect } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MonitorTable } from "./monitor-table"
import { useMonitors, useCreateMonitor, useUpdateMonitor, useDeleteMonitor, useTriggerCheck, useTriggerCheckAll, type CheckAllProgress } from "@/hooks/use-monitors"
import { useDebounce } from "@/hooks/use-debounce"
import { SmoothSelect } from "@/components/ui/smooth-select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/r-alert-dialog"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Search, Plus, RefreshCw } from "lucide-react"
import type { MonitorListItem, CreateMonitorPayload } from "@/types/api"
import type { SortField } from "./monitor-table"
import { MonitorCreateDrawer } from "./monitor-create-drawer"
import { MonitorEditDrawer } from "./monitor-edit-drawer"

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "unknown", label: "Unknown" },
]

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "http", label: "HTTP" },
  { value: "https", label: "HTTPS" },
  { value: "tcp", label: "TCP" },
  { value: "ping", label: "Ping" },
  { value: "keyword", label: "Keyword" },
]

export function MonitorsPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const page = Number(searchParams.get("page")) || 1
  const search = searchParams.get("search") || ""
  const statusFilter = searchParams.get("status") || "all"
  const typeFilter = searchParams.get("type") || "all"
  const sortField = (searchParams.get("sort_by") || "name") as SortField
  const sortOrder = (searchParams.get("sort_order") || "asc") as "asc" | "desc"
  const limit = 50

  const [inputValue, setInputValue] = useState(search)
  const debouncedSearch = useDebounce(inputValue, 300)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingMonitor, setEditingMonitor] = useState<MonitorListItem | null>(null)
  const [refreshAllOpen, setRefreshAllOpen] = useState(false)

  useEffect(() => {
    if (search !== inputValue && search !== debouncedSearch) {
      setInputValue(search)
    }
  }, [search])

  useEffect(() => {
    if (debouncedSearch !== search) {
      const params = new URLSearchParams(searchParams.toString())
      if (debouncedSearch) {
        params.set("search", debouncedSearch)
      } else {
        params.delete("search")
      }
      params.set("page", "1")
      router.replace(`${pathname}?${params.toString()}`)
    }
  }, [debouncedSearch, search, searchParams, router, pathname])

  const { data, isLoading } = useMonitors({
    page,
    search,
    current_status: statusFilter !== "all" ? statusFilter : undefined,
    check_type: typeFilter !== "all" ? typeFilter : undefined,
    limit,
    sort_by: sortField,
    sort_order: sortOrder,
  })

  const { mutate: createMonitor, isPending: isCreating } = useCreateMonitor()
  const { mutate: updateMonitor, isPending: isUpdating } = useUpdateMonitor()
  const { mutate: deleteMonitor } = useDeleteMonitor()
  const { mutate: triggerCheck } = useTriggerCheck()

  const [refreshProgress, setRefreshProgress] = useState<CheckAllProgress | null>(null)
  const handleRefreshProgress = useCallback((progress: CheckAllProgress) => {
    setRefreshProgress(progress)
  }, [])
  const handleRefreshComplete = useCallback(() => {
    // Keep progress visible briefly so the user sees the completion state
    setTimeout(() => setRefreshProgress(null), 2000)
  }, [])
  const { mutate: triggerCheckAll, isPending: isRefreshingAll } = useTriggerCheckAll(handleRefreshProgress, handleRefreshComplete)

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value)
        else params.delete(key)
      })
      if (!updates.page) params.set("page", "1")
      router.replace(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const handleSearchChange = useCallback((value: string) => {
    setInputValue(value)
  }, [])

  const handlePageChange = useCallback(
    (newPage: number) => {
      updateParams({ page: String(newPage) })
    },
    [updateParams]
  )

  const handleSort = useCallback(
    (field: SortField) => {
      const newOrder = field === sortField && sortOrder === "asc" ? "desc" : "asc"
      updateParams({ sort_by: field, sort_order: newOrder })
    },
    [sortField, sortOrder, updateParams]
  )

  const handleCreateSubmit = useCallback(
    (formData: { asset_id: string; name: string; check_type: string; target: string; interval_seconds?: number; expected_status_code?: number; expected_keyword?: string; enabled?: boolean }) => {
      createMonitor(formData as CreateMonitorPayload, {
        onSuccess: () => setCreateOpen(false),
      })
    },
    [createMonitor]
  )

  const handleEditSubmit = useCallback(
    (formData: { name?: string; check_type?: string; target?: string; interval_seconds?: number; enabled?: boolean }) => {
      if (!editingMonitor) return
      const payload: Record<string, unknown> = { ...formData }
      if (formData.check_type) payload.check_type = formData.check_type
      updateMonitor({ id: editingMonitor.id, ...payload } as Parameters<typeof updateMonitor>[0], {
        onSuccess: () => {
          setEditOpen(false)
          setEditingMonitor(null)
        },
      })
    },
    [updateMonitor, editingMonitor]
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteMonitor(id)
    },
    [deleteMonitor]
  )

  const handleEdit = useCallback(
    (monitor: MonitorListItem) => {
      setEditingMonitor(monitor)
      setEditOpen(true)
    },
    []
  )

  const handleTriggerCheck = useCallback(
    (id: string) => {
      triggerCheck(id)
    },
    [triggerCheck]
  )

  const totalPages = data?.meta.totalPages ?? 0
  const total = data?.meta.total ?? 0

  return (
    <div className="container mx-auto max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Monitors</h1>
            <p className="text-muted-foreground mt-1">
              Monitor uptime and health of your endpoints
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshAllOpen(true)}
              disabled={isRefreshingAll}
            >
              <RefreshCw className={`size-3.5 mr-1.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
              {isRefreshingAll ? 'Refreshing...' : 'Refresh All Monitors'}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1.5" />
              New Monitor
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search monitors by name or target..."
              value={inputValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-3">
            <div className="w-40">
              <SmoothSelect
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(value) => updateParams({ status: value === "all" ? undefined : value })}
                className="[&>button]:min-h-9 [&>button]:h-9 [&>button]:text-xs"
              />
            </div>
            <div className="w-40">
              <SmoothSelect
                options={TYPE_OPTIONS}
                value={typeFilter}
                onChange={(value) => updateParams({ type: value === "all" ? undefined : value })}
                className="[&>button]:min-h-9 [&>button]:h-9 [&>button]:text-xs"
              />
            </div>
          </div>
        </div>

        {/* Results summary */}
        {!isLoading && (
          <p className="text-xs text-muted-foreground">
            Showing {data?.data.length ?? 0} of {total} monitors
          </p>
        )}

        {/* Table */}
        <MonitorTable
          data={data?.data ?? []}
          isLoading={isLoading}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTriggerCheck={handleTriggerCheck}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    if (page > 1) handlePageChange(page - 1)
                  }}
                  className={page === 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        handlePageChange(pageNum)
                      }}
                      isActive={page === pageNum}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                )
              })}

              {totalPages > 5 && page < totalPages - 2 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    if (page < totalPages) handlePageChange(page + 1)
                  }}
                  className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

      {/* Create Drawer */}
      <MonitorCreateDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateSubmit}
        isPending={isCreating}
      />

      {/* Edit Drawer */}
      {editingMonitor && (
        <MonitorEditDrawer
          key={`edit-${editingMonitor.id}`}
          open={editOpen}
          onOpenChange={(open) => { setEditOpen(open); if (!open) setEditingMonitor(null) }}
          onSubmit={handleEditSubmit}
          isPending={isUpdating}
          monitor={editingMonitor}
        />
      )}

      {/* Refresh All Progress */}
      {isRefreshingAll && refreshProgress && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="size-4 animate-spin text-primary" />
              <span className="text-sm font-medium">
                {refreshProgress.type === 'start'
                  ? `Starting check of ${refreshProgress.data.total ?? 0} monitors...`
                  : refreshProgress.type === 'progress'
                  ? `Checking ${refreshProgress.data.monitorName ?? ''} (${refreshProgress.data.current ?? 0}/${refreshProgress.data.total ?? 0})...`
                  : 'Finalizing...'}`
              </span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {refreshProgress.data.current ?? 0} / {refreshProgress.data.total ?? 0}
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${refreshProgress.data.total
                  ? ((refreshProgress.data.current ?? 0) / refreshProgress.data.total) * 100
                  : 0}%`,
              }}
            />
          </div>
          {refreshProgress.type === 'progress' && refreshProgress.data.status === 'error' && (
            <p className="text-xs text-red-500 mt-2">
              Failed to check {refreshProgress.data.monitorName ?? 'monitor'}
            </p>
          )}
        </div>
      )}

      {/* Refresh All Confirmation */}
      <AlertDialog open={refreshAllOpen} onOpenChange={(open) => { setRefreshAllOpen(open); if (!open) setRefreshProgress(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh All Monitors</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately check all enabled monitors and may create new incidents for any that are down. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { triggerCheckAll(); setRefreshAllOpen(false) }}>
              Refresh Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
