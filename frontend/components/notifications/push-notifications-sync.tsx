"use client"

import { useWebPush } from "@/hooks/use-web-push"

/**
 * Initialises the service worker and re-syncs the user's push subscription
 * with the backend whenever the app loads. Renders nothing.
 */
export function PushNotificationsSync() {
  useWebPush()
  return null
}
