"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useDashboardOverview } from "@/hooks/use-dashboard";
import { useTriggerCheckAll, type CheckAllProgress } from "@/hooks/use-monitors";
import { CriticalAlertsBanner } from "@/components/dashboard/critical-alerts-banner";
import { StatCards } from "@/components/dashboard/stat-cards";
import { DomainHealth } from "@/components/dashboard/domain-health";
import { ExpiringDomainsList } from "@/components/dashboard/expiring-domains-list";
import { ExpiringContracts } from "@/components/dashboard/expiring-contracts";
import { ExpiringSsl } from "@/components/dashboard/expiring-ssl";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { IncidentHealthWidget } from "@/components/dashboard/incident-health";
import { RecentIncidentsList } from "@/components/dashboard/recent-incidents-list";
import { Button } from "@/components/ui/button";
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
import { RefreshCw } from "lucide-react";

export default function DashboardPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [refreshAllOpen, setRefreshAllOpen] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<CheckAllProgress | null>(null);
  const handleRefreshProgress = useCallback((progress: CheckAllProgress) => {
    setRefreshProgress(progress);
  }, []);
  const handleRefreshComplete = useCallback(() => {
    setTimeout(() => setRefreshProgress(null), 2000);
  }, []);
  const { mutate: triggerCheckAll, isPending: isRefreshingAll } = useTriggerCheckAll(handleRefreshProgress, handleRefreshComplete);

  const { data, isLoading } = useDashboardOverview(userId);

  const summary = data?.summary;
  const expiryStats = data?.domainExpiryStats;
  const expiringDomains = data?.expiringDomains;
  const expiringContracts = data?.expiringContracts;
  const expiringSsl = data?.expiringSsl;

  // Critical alerts: filtered to manager's clients only, expiring within 7 days
  const criticalDomains = (data?.managerExpiringDomains || []).filter(
    (d) =>
      d.days_to_expiry !== null &&
      d.days_to_expiry > 0 &&
      d.days_to_expiry <= 7,
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto px-4 py-1 max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Overview of your infrastructure and upcoming expirations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshAllOpen(true)}
            disabled={isRefreshingAll}
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
            {isRefreshingAll ? 'Refreshing...' : 'Refresh All Monitors'}
          </Button>
        </div>

        <CriticalAlertsBanner domains={criticalDomains} />
        <StatCards
          summary={summary}
          expiryStats={expiryStats}
          isLoading={isLoading}
        />

        {/* Open Incidents + Recent Incidents List */}
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
          <div className="col-span-2">
            <IncidentHealthWidget
              summary={data?.incidentSummary}
              isLoading={isLoading}
            />
          </div>
          <div className="col-span-4">
            <RecentIncidentsList
              summary={data?.incidentSummary}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Domain Health + Expiring Domains */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
         <div className="col-span-3">
           <DomainHealth stats={expiryStats} isLoading={isLoading} />
         </div>
        <div className="col-span-4">
            <ExpiringDomainsList
            domains={expiringDomains}
            isLoading={isLoading}
          />
        </div>
        </div>

        {/* Contracts + SSL Expiring */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExpiringContracts
            contracts={expiringContracts}
            isLoading={isLoading}
          />
          <ExpiringSsl certs={expiringSsl} isLoading={isLoading} />
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

        <QuickActions />
      </div>
    </div>
  );
}
