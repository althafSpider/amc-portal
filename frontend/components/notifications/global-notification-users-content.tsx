"use client"

import { useCallback, useState } from "react"
import {
  BellRing,
  Plus,
  Trash2,
  Search,
  Loader2,
  Users,
  Shield,
  CheckCircle2,
  XCircle,
  UserCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { useGlobalNotificationUsers } from "@/hooks/use-global-notification-users"
import { useUsers } from "@/hooks/use-users"
import { useDebounce } from "@/hooks/use-debounce"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

export function GlobalNotificationUsersContent() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "admin"
  const { list, add, remove } = useGlobalNotificationUsers()

  const { data: globalUsers, isLoading } = list

  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearch = useDebounce(searchQuery, 300)

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [removeUserId, setRemoveUserId] = useState<string | null>(null)

  // Fetch all users for the add dialog
  const { data: allUsersData } = useUsers({
    page: 1,
    limit: 100,
    search: debouncedSearch || undefined,
  })

  const allUsers = allUsersData?.data ?? []
  const activeUsers = allUsers.filter((u) => u.is_active)

  // Filter out users already in the global list
  const globalUserIds = new Set(globalUsers?.map((g) => g.user_id) ?? [])
  const availableUsers = activeUsers

  const handleAddUser = useCallback(
    (userId: string) => {
      add.mutate(userId, {
        onSuccess: () => setShowAddDialog(false),
      })
    },
    [add],
  )

  const handleRemoveUser = useCallback(() => {
    if (removeUserId) {
      remove.mutate(removeUserId, {
        onSuccess: () => setRemoveUserId(null),
      })
    }
  }, [removeUserId, remove])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value)
    },
    [],
  )

  return (
    <div className="container mx-auto max-w-5xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
                <BellRing className="size-5 text-amber-500" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Global Notification Users</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  These users receive ALL notifications automatically — across every client, asset, and system event
                </p>
              </div>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowAddDialog(true)} className="shrink-0">
              <Plus className="size-4 mr-1.5" />
              Add User
            </Button>
          )}
        </div>

        {/* Info card */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
              <BellRing className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-0.5">How global notifications work</p>
              <p className="text-amber-700/80 dark:text-amber-300/70 text-xs leading-relaxed">
                Users added to this list receive every in-app notification sent through the system — including incidents,
                expiry reminders, contract renewals, and all other alerts. Use this for administrators or team leads who
                need complete visibility.
              </p>
            </div>
          </div>
        </div>

        {/* Users list */}
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl border border-border/60 p-4"
              >
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))
          ) : !globalUsers || globalUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
                <Users className="size-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No global recipients</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No users are currently configured to receive all notifications. Add users above to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    {isAdmin && <TableHead className="w-16 text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {globalUsers.map((user) => (
                    <TableRow
                      key={user.user_id}
                      className="group transition-colors hover:bg-muted/40"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="dot" size="sm" color={user.role === "admin" ? "purple" : "blue"}>
                          {user.role === "admin" ? (
                            <Shield className="size-3 mr-1" />
                          ) : (
                            <UserCheck className="size-3 mr-1" />
                          )}
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="size-3.5" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <XCircle className="size-3.5" />
                            Inactive
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString()}
                        </span>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="size-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setRemoveUserId(user.user_id)}
                            title="Remove from global recipients"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Global Notification Recipient</DialogTitle>
            <DialogDescription>
              Selected users will receive ALL system notifications. Choose users who need complete visibility.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1 rounded-lg border border-border/60 p-1">
              {availableUsers.length === 0 ? (
                <p className="text-center py-8 text-sm text-muted-foreground">
                  {searchQuery ? "No users found matching your search" : "All active users are already recipients"}
                </p>
              ) : (
                availableUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    )}
                    onClick={() => handleAddUser(user.id)}
                    disabled={add.isPending}
                  >
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <Badge variant="dot" size="sm" color={user.role === "admin" ? "purple" : "blue"}>
                      {user.role}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="text-xs text-muted-foreground">
            {globalUsers?.length ?? 0} current recipient{(globalUsers?.length ?? 0) !== 1 ? "s" : ""}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog
        open={!!removeUserId}
        onOpenChange={(open) => !open && setRemoveUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Global Notification Recipient</AlertDialogTitle>
            <AlertDialogDescription>
              This user will no longer receive automatic copies of all system notifications.
              They will still receive notifications targeted directly to them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              disabled={remove.isPending}
              className="bg-destructive hover:bg-destructive/80"
            >
              {remove.isPending ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="size-4 mr-1.5" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
