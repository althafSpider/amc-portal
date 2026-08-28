"use client";

import { useCallback, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  useIncidents,
  useResolveIncident,
  useAcknowledgeIncident,
  useDeleteIncident,
  useCheckExpiredIncidents,
} from "@/hooks/use-incidents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SmoothSelect } from "@/components/ui/smooth-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/r-alert-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  MoreVertical,
  Eye,
  Trash2,
  ExternalLink,
  Clock,
  Globe,
  Shield,
  Monitor,
  LayoutDashboard,
  RefreshCw,
} from "lucide-react";
import { useTriggerCheckAll, type CheckAllProgress } from "@/hooks/use-monitors";
import type { IncidentListItem, IncidentSeverity } from "@/types/api";

const SEVERITY_CONFIG: Record<
  IncidentSeverity,
  {
    color: "red" | "amber" | "blue" | "gray";
    icon: typeof AlertTriangle;
    label: string;
  }
> = {
  critical: { color: "red", icon: AlertTriangle, label: "Critical" },
  major: { color: "amber", icon: AlertCircle, label: "Major" },
  minor: { color: "blue", icon: Info, label: "Minor" },
  info: { color: "gray", icon: Info, label: "Info" },
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
];

const SEVERITY_OPTIONS = [
  { value: "all", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
  { value: "info", label: "Info" },
];

export function IncidentsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get("page")) || 1;
  const statusFilter = searchParams.get("status") || "all";
  const severityFilter = searchParams.get("severity") || "all";
  const limit = 50;

  const { data, isLoading } = useIncidents({
    page,
    limit,
    status:
      statusFilter !== "all"
        ? (statusFilter as "open" | "resolved")
        : undefined,
    severity: severityFilter !== "all" ? severityFilter : undefined,
    sort_by: "started_at",
    sort_order: "desc",
  });
  const { mutate: resolveIncident, isPending: isResolving } =
    useResolveIncident();
  const { mutate: acknowledgeIncident, isPending: isAcknowledging } =
    useAcknowledgeIncident();
  const { mutate: deleteIncident } = useDeleteIncident();
  const { mutate: checkExpired, isPending: isCheckingExpired } =
    useCheckExpiredIncidents();
  const [refreshProgress, setRefreshProgress] = useState<CheckAllProgress | null>(null);
  const handleRefreshProgress = useCallback((progress: CheckAllProgress) => {
    setRefreshProgress(progress);
  }, []);
  const handleRefreshComplete = useCallback(() => {
    setTimeout(() => setRefreshProgress(null), 2000);
  }, []);
  const { mutate: triggerCheckAll, isPending: isRefreshingAll } = useTriggerCheckAll(handleRefreshProgress, handleRefreshComplete);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [refreshAllOpen, setRefreshAllOpen] = useState(false);
  const deleteIncidentItem = data?.data.find((i) => i.id === deleteId);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      if (!updates.page) params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      updateParams({ page: String(newPage) });
    },
    [updateParams],
  );

  const totalPages = data?.meta.totalPages ?? 0;
  const total = data?.meta.total ?? 0;

  return (
    <div className="container mx-auto max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
            <p className="text-muted-foreground mt-1">
              Monitor incidents and system alerts
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkExpired()}
              disabled={isCheckingExpired}
            >
              <AlertTriangle className="size-3.5 mr-1.5" />
              {isCheckingExpired ? "Checking..." : "Check Expired"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="w-40">
            <SmoothSelect
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(value) =>
                updateParams({ status: value === "all" ? undefined : value })
              }
              className="[&>button]:min-h-9 [&>button]:h-9 [&>button]:text-xs"
            />
          </div>
          <div className="w-40">
            <SmoothSelect
              options={SEVERITY_OPTIONS}
              value={severityFilter}
              onChange={(value) =>
                updateParams({ severity: value === "all" ? undefined : value })
              }
              className="[&>button]:min-h-9 [&>button]:h-9 [&>button]:text-xs"
            />
          </div>
        </div>

        {/* Results summary */}
        {!isLoading && (
          <p className="text-xs text-muted-foreground">
            Showing {data?.data.length ?? 0} of {total} incidents
          </p>
        )}

        {/* Table */}
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Severity</TableHead>
                <TableHead>Monitor</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Cause</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-12 text-muted-foreground"
                  >
                    No incidents found
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((incident) => {
                  const severityCfg = SEVERITY_CONFIG[incident.severity];
                  const SeverityIcon = severityCfg.icon;
                  const isResolved = !!incident.resolved_at;
                  return (
                    <TableRow
                      key={incident.id}
                      className="cursor-pointer group transition-colors hover:bg-muted/40"
                      onClick={() => router.push(`/incidents/${incident.id}`)}
                    >
                      <TableCell>
                        <Badge
                          variant="dot"
                          style={{ backgroundColor: severityCfg.color }}
                          className="capitalize flex items-center gap-1"
                        >
                          {/* <SeverityIcon className="size-1" /> */}
                         <SeverityIcon size="1.5" /> {severityCfg.label} 
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {incident.target_type === 'domain' ? (
                          <div className="flex items-center gap-2">
                            <Globe className="size-4 shrink-0 text-blue-500" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium truncate max-w-[180px]">
                                {incident.domain_fqdn || "—"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Domain Expiry
                              </span>
                            </div>
                          </div>
                        ) : incident.target_type === 'ssl' ? (
                          <div className="flex items-center gap-2">
                            <Shield className="size-4 shrink-0 text-emerald-500" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium truncate max-w-[180px]">
                                {incident.ssl_name || incident.domain_fqdn || "—"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                SSL Expiry
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Monitor className="size-4 shrink-0 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium truncate max-w-[180px]">
                                {incident.monitor_name || "—"}
                              </span>
                              <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                                {incident.monitor_target}
                              </span>
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {incident.asset_id && incident.asset_name ? (
                          <Link
                            href={`/projects/${incident.asset_id}`}
                            className="flex items-center gap-2 text-sm hover:text-foreground hover:underline underline-offset-2 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <LayoutDashboard className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate max-w-[130px]">{incident.asset_name}</span>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
                          {incident.cause || incident.notes || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(incident.started_at).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {isResolved && incident.duration_seconds !== null
                            ? `${Math.floor(incident.duration_seconds / 60)}m ${incident.duration_seconds % 60}s`
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {isResolved ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="size-3" />
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                            <Clock className="size-3" />
                            Open
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="size-7"
                              >
                                <MoreVertical className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/incidents/${incident.id}`);
                                }}
                              >
                                <Eye className="size-3.5 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {!isResolved && (
                                <>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      acknowledgeIncident(incident.id);
                                    }}
                                    disabled={isAcknowledging}
                                  >
                                    <CheckCircle2 className="size-3.5 mr-2" />
                                    Acknowledge
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      resolveIncident(incident.id);
                                    }}
                                    disabled={isResolving}
                                  >
                                    <CheckCircle2 className="size-3.5 mr-2" />
                                    Resolve
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteId(incident.id);
                                }}
                              >
                                <Trash2 className="size-3.5 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page > 1) handlePageChange(page - 1);
                  }}
                  className={page === 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        handlePageChange(pageNum);
                      }}
                      isActive={page === pageNum}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
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
                    e.preventDefault();
                    if (page < totalPages) handlePageChange(page + 1);
                  }}
                  className={
                    page === totalPages ? "pointer-events-none opacity-50" : ""
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

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

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Incident</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this incident for{" "}
              <strong>{deleteIncidentItem?.monitor_name}</strong>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteIncident(deleteId);
                setDeleteId(null);
              }}
              className="bg-destructive hover:bg-destructive/80"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
