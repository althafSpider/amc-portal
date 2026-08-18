"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import apiClient from "@/lib/api-client"

const PUSH_PREFERENCES_KEY = "push-preferences"

export interface PushPreferencesResponse {
  pushTypes: string[] | null
}

/**
 * Load the user's browser push type preferences.
 * pushTypes is null when no preferences are saved (all types enabled).
 */
export function usePushPreferences() {
  return useQuery({
    queryKey: [PUSH_PREFERENCES_KEY],
    queryFn: async () => {
      const { data } = await apiClient.get<PushPreferencesResponse>(
        "/push/preferences",
      )
      return data
    },
  })
}

export function useUpdatePushPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pushTypes: string[]) => {
      const { data } = await apiClient.put<PushPreferencesResponse>(
        "/push/preferences",
        { pushTypes },
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PUSH_PREFERENCES_KEY] })
      toast.success("Push notification preferences saved")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

interface TestPushResponse {
  success: boolean
  message: string
}

/**
 * Send a test push notification to the user's devices.
 */
export function useSendTestPush() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<TestPushResponse>("/push/test")
      return data
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.error(data.message)
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
