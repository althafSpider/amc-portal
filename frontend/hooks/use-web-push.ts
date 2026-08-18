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
 * Pre-flight check: verify the browser can reach Google's push service
 * before attempting the full subscribe handshake. Uses a HEAD request
 * to FCM's ping endpoint — fails fast if the network blocks it.
 */
async function checkPushConnectivity(): Promise<{ reachable: boolean; error?: string }> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    await fetch("https://fcm.googleapis.com/fcm/ping", {
      method: "HEAD",
      mode: "no-cors",
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    return { reachable: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/abort/i.test(msg)) {
      return { reachable: false, error: "Timed out reaching Google's push servers." }
    }
    return { reachable: false, error: msg }
  }
}

/**
 * Turn a browser push error into something a user can act on.
 * Includes the raw error in the console for debugging.
 */
function describePushError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  console.error("[push] Raw subscribe error:", msg, err)

  if (/permission denied/i.test(msg)) {
    return (
      "The browser refused the push subscription. " +
      "Make sure notifications are allowed for this site in your browser's address-bar settings " +
      "(click the lock/tune icon → Notifications → Allow)."
    )
  }
  if (/applicationServerKey|bad application server key/i.test(msg)) {
    return "The server's push key is invalid. Ask an admin to regenerate the VAPID keys."
  }
  if (/service.?worker.*mime|mimeType|text\/html/i.test(msg)) {
    return (
      "The service worker file couldn't be loaded (wrong file type served). " +
      "Try hard-refreshing the page (Ctrl+Shift+R)."
    )
  }
  if (/network|fetch|failed to fetch|service error/i.test(msg)) {
    return (
      "Your browser couldn't connect to the push notification service (Google FCM). " +
      "This usually means your network blocks it — common on corporate Wi-Fi, " +
      "VPNs, or in some regions. Try: " +
      "1) A different network (e.g. mobile data), " +
      "2) Firefox (uses Mozilla's push service instead of Google's), " +
      "or 3) Ask your IT/network admin to allow *.google.com traffic."
    )
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

      // Step 1: Register the service worker
      let registration: ServiceWorkerRegistration
      try {
        registration = await navigator.serviceWorker.register("/sw.js")
      } catch (swErr) {
        console.error("[push] SW registration failed:", swErr)
        toast.error(
          "Failed to load the background service worker. Try hard-refreshing the page (Ctrl+Shift+R). " +
          "If the problem persists, check that push notifications aren't blocked by your browser.",
        )
        return
      }

      // Cache the API base for the service worker (used on pushsubscriptionchange)
      try {
        const cache = await caches.open("amc-push-meta")
        await cache.put("/api-base", new Response(API_BASE))
      } catch {
        // Non-fatal
      }

      // Step 2: Fetch the VAPID public key from the server
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

      // Step 3: Pre-flight check — can this browser reach Google's push service?
      const { reachable, error: reachError } = await checkPushConnectivity()
      if (!reachable) {
        console.warn("[push] Connectivity check failed:", reachError)
        toast.error(
          "Your network appears to block Google's push notification servers " +
          `(FCM). ${reachError ?? ""} ` +
          "Push notifications won't work on this network. Try a different " +
          "network (e.g. mobile data) or Firefox (uses Mozilla's push service).",
          { duration: 8000 },
        )
        return
      }

      // Step 4: Subscribe the browser to push
      let subscription: PushSubscription
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      } catch (subErr) {
        console.error("[push] Subscribe failed:", subErr)
        toast.error(`Couldn't enable push notifications: ${describePushError(subErr)}`, {
          duration: 10000,
        })
        return
      }

      // Step 5: Save the subscription to the backend
      const saved = await syncSubscription(subscription)
      if (!saved) {
        toast.error(
          "Push was enabled in this browser, but saving it to the server failed. Try signing in again.",
        )
        return
      }

      toast.success("Push notifications enabled on this browser.")
    } catch (err) {
      console.error("[push] Unexpected error:", err)
      toast.error(`Couldn't enable push notifications: ${describePushError(err)}`, {
        duration: 10000,
      })
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
