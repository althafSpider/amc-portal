"use client"

import { useState } from "react"
import { BellRing, BellOff, Bell, Loader2, Info, Send } from "lucide-react"
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/r-checkbox"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useWebPush } from "@/hooks/use-web-push"
import { usePushPreferences, useUpdatePushPreferences, useSendTestPush } from "@/hooks/use-push-preferences"

const PUSH_TYPES = [
  {
    value: "domain_expiry",
    label: "Domain expiry reminders",
    description: "Domains nearing or past their expiry date",
  },
  {
    value: "ssl_expiry",
    label: "SSL certificate expiry reminders",
    description: "Certificates nearing or past their expiry date",
  },
  {
    value: "contract_expiry",
    label: "Contract renewal reminders",
    description: "Contracts nearing their renewal date",
  },
  {
    value: "server_expiry",
    label: "Server renewal reminders",
    description: "Servers nearing their renewal date",
  },
  {
    value: "incident",
    label: "Incident alerts",
    description: "New monitoring incidents and outages",
  },
] as const

const ALL_TYPES = PUSH_TYPES.map((t) => t.value)

function setsEqual(a: string[], b: string[]): boolean {
  const sort = (arr: string[]) => [...arr].sort()
  const sa = sort(a)
  const sb = sort(b)
  return sa.length === sb.length && sa.every((v, i) => v === sb[i])
}

export default function NotificationsPage() {
  const {
    isSupported,
    isSubscribed,
    isLoading: isPushLoading,
    permission,
    enable,
    disable,
  } = useWebPush()

  const { data: prefs, isLoading: prefsLoading } = usePushPreferences()
  const updatePrefs = useUpdatePushPreferences()
  const sendTest = useSendTestPush()

  // null = user hasn't edited yet
  const [selected, setSelected] = useState<string[] | null>(null)

  const savedTypes = prefs?.pushTypes ?? null
  const current = selected ?? savedTypes ?? ALL_TYPES
  const hasChanges =
    selected !== null && !setsEqual(selected, savedTypes ?? ALL_TYPES)

  const toggleType = (value: string, checked: boolean) => {
    setSelected((prev) => {
      const base = prev ?? savedTypes ?? ALL_TYPES
      const next = checked
        ? [...base, value]
        : base.filter((v) => v !== value)
      return ALL_TYPES.filter((v) => next.includes(v))
    })
  }

  const handleSave = () => {
    if (selected === null) return
    updatePrefs.mutate(ALL_TYPES.filter((v) => selected.includes(v)))
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Bell className="size-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Notification Preferences
          </h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Choose how you want to be alerted — these settings only apply to your account
        </p>
      </div>

      <Separator className="mb-6" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSubscribed ? (
              <BellRing className="size-4 text-emerald-500" />
            ) : (
              <BellOff className="size-4" />
            )}
            Browser Push Notifications
          </CardTitle>
          <CardDescription>
            Receive alerts on this browser even when the portal tab is closed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Push on/off toggle */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {isSubscribed ? "Push enabled on this browser" : "Push disabled"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {!isSupported
                  ? "This browser doesn't support push notifications"
                  : permission === "denied"
                    ? "Notifications are blocked — allow them in your browser's site settings"
                    : isSubscribed
                      ? "Alerts will appear even when the tab is closed"
                      : "Turn this on to receive alerts in your browser"}
              </p>
            </div>
            {isSupported && (
              <button
                type="button"
                role="switch"
                aria-checked={isSubscribed}
                aria-label="Toggle push notifications"
                disabled={isPushLoading}
                onClick={() => (isSubscribed ? disable() : enable())}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                  isSubscribed ? "bg-emerald-500" : "bg-input",
                )}
              >
                {isPushLoading ? (
                  <Loader2 className="mx-auto size-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <span
                    className={cn(
                      "inline-block size-4 transform rounded-full bg-white shadow transition-transform",
                      isSubscribed ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                )}
              </button>
            )}
          </div>

          {/* Test delivery */}
          {isSubscribed && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-4">
              <p className="text-xs text-muted-foreground">
                Not sure it works? Send a test alert to this browser.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendTest.mutate()}
                disabled={sendTest.isPending}
                className="shrink-0"
              >
                {sendTest.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Send test notification
              </Button>
            </div>
          )}

          {/* Type selection */}
          {isSubscribed && (
            <div>
              <p className="text-sm font-medium mb-1">Alert types</p>
              <p className="text-xs text-muted-foreground mb-3">
                Choose which notification types are sent to your browser. If none are
                selected, no push notifications will be sent.
              </p>

              {prefsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: PUSH_TYPES.length }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {PUSH_TYPES.map((type) => (
                    <div
                      key={type.value}
                      className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
                    >
                      <Checkbox
                        checked={current.includes(type.value)}
                        onCheckedChange={(checked) =>
                          toggleType(type.value, checked)
                        }
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{type.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {type.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!prefsLoading && (
                <div className="flex justify-end gap-2 pt-4">
                  {hasChanges && (
                    <Button
                      variant="outline"
                      onClick={() => setSelected(null)}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={handleSave}
                    disabled={!hasChanges || updatePrefs.isPending}
                  >
                    {updatePrefs.isPending && (
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                    )}
                    Save preferences
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Info note */}
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3">
            <Info className="size-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <p className="font-medium">How it works</p>
              <p>
                Push notifications work per browser. If you use the portal from
                another device or browser, enable push there too. In-app
                notifications always appear in the bell menu regardless of these
                settings.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
