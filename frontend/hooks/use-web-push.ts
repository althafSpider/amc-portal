"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import apiClient from "@/lib/api-client"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  )
}

/**
 * Turn a browser push error into something a user can act on.
 */
function describePushError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/permission denied/i.test(msg)) {
    return "The browser refused the push subscription. Make sure notifications are allowed for this site and try again."
  }
  if (/applicationServerKey|bad application server key/i.test(msg)) {
    return "The server's push key is invalid. Check the VAPID configuration."
  }
  if (/network|fetch|failed to fetch|service error/i.test(msg)) {
    return "The browser couldn't reach the push service. Check your internet connection and try again."
  }
  return msg
}

export function useWebPush() {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [isSupported] = useState(isPushSupported)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    isPushSupported() ? Notification.permission : "unsupported",
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const subscriptionRef = useRef<PushSubscription | null>(null)

  // Push the browser subscription to the backend (upsert by endpoint).
  // Returns true when the subscription was saved successfully.
  const syncSubscription = useCallback(async (subscription: PushSubscription): Promise<boolean> => {
    try {
      const json = subscription.toJSON() as {
        endpoint: string
        keys?: { p256dh: string; auth: string }
      }
      if (!json.endpoint || !json.keys) return false
      await apiClient.post("/push/subscriptions", {
        endpoint: json.endpoint,
        expirationTime: null,
        keys: json.keys,
      })
      subscriptionRef.current = subscription
      setIsSubscribed(true)
      return true
    } catch (err) {
      console.warn("Failed to save push subscription:", err)
      return false
    }
  }, [])

  // Register the service worker, restore subscription state, and
  // re-sync existing subscriptions with the backend on load.
  useEffect(() => {
    if (!isSupported || !userId) return
    let cancelled = false

    const init = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js")
        if (cancelled) return

        const subscription = await registration.pushManager.getSubscription()
        if (cancelled) return

        subscriptionRef.current = subscription
        setIsSubscribed(
          !!subscription && Notification.permission === "granted",
        )

        // Re-sync an existing subscription in case the backend lost it
        // (e.g. database restore) or keys were rotated.
        if (subscription && Notification.permission === "granted") {
          await syncSubscription(subscription)
        }
      } catch (err) {
        console.warn("Failed to initialise push notifications:", err)
      }
    }

    init()

    // Handle subscription changes reported by the service worker
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED" && event.data.subscription) {
        syncSubscription(event.data.subscription)
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage)

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener("message", onMessage)
    }
  }, [isSupported, userId, syncSubscription])

  // Ask for permission and subscribe the browser to push
  const enable = useCallback(async () => {
    if (!isSupported) return
    setIsLoading(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result === "denied") {
        toast.error(
          "Notifications are blocked for this site. Allow them in the browser's site settings, then try again.",
        )
        return
      }
      if (result === "default") {
        toast.info("Permission wasn't granted, so push notifications stay off.")
        return
      }

      const registration = await navigator.serviceWorker.register("/sw.js")

      // Cache the API base for the service worker (used on pushsubscriptionchange)
      try {
        const cache = await caches.open("amc-push-meta")
        await cache.put("/api-base", new Response(API_BASE))
      } catch {
        // Non-fatal
      }

      let publicKey: string | null = null
      try {
        const { data } = await apiClient.get<{ publicKey: string | null }>(
          "/push/vapid-public-key",
        )
        publicKey = data?.publicKey ?? null
      } catch (err) {
        console.warn("Failed to fetch VAPID public key:", err)
      }

      if (!publicKey) {
        toast.error(
          "Web push isn't configured on the server yet (VAPID keys missing). Ask an admin to add them.",
        )
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const saved = await syncSubscription(subscription)
      if (!saved) {
        toast.error(
          "Push was enabled in this browser, but saving it to the server failed. Try signing in again.",
        )
        return
      }

      toast.success("Push notifications enabled on this browser.")
    } catch (err) {
      console.warn("Failed to enable push notifications:", err)
      toast.error(`Couldn't enable push notifications: ${describePushError(err)}`)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, syncSubscription])

  // Unsubscribe the browser and remove the subscription from the backend
  const disable = useCallback(async () => {
    if (!isSupported) return
    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker.register("/sw.js")
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        try {
          await apiClient.delete("/push/subscriptions", {
            data: { endpoint: subscription.endpoint },
          })
        } catch (err) {
          console.warn("Failed to remove push subscription from backend:", err)
        }
        await subscription.unsubscribe()
      }
      subscriptionRef.current = null
      setIsSubscribed(false)
      toast.success("Push notifications disabled on this browser.")
    } catch (err) {
      console.warn("Failed to disable push notifications:", err)
      toast.error(`Couldn't disable push notifications: ${describePushError(err)}`)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    enable,
    disable,
  }
}
