"use client"

import { useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import apiClient from "@/lib/api-client"
import type {
  MonitorListItem,
  MonitorDetail,
  MonitorCheck,
  PaginatedResponse,
  ApiResponse,
  CreateMonitorPayload,
  UpdateMonitorPayload,
  ListMonitorsParams,
} from "@/types/api"

const MONITORS_KEY = "monitors"

export function useMonitors(params: ListMonitorsParams) {
  return useQuery({
    queryKey: [MONITORS_KEY, "list", params],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<MonitorListItem>>("/monitor/list", { params })
      return data
    },
    placeholderData: (prev) => prev,
  })
}

export function useMonitorsByProject(projectId: string | null) {
  return useQuery({
    queryKey: [MONITORS_KEY, "by-asset", projectId],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<MonitorListItem>>(
        "/monitor/list",
        { params: { asset_id: projectId, limit: 100, sort_by: "name", sort_order: "asc" } }
      )
      return data
    },
    enabled: !!projectId,
  })
}

export function useMonitor(id: string | null) {
  return useQuery({
    queryKey: [MONITORS_KEY, id],
    queryFn: async () => {
      const { data } = await apiClient.get<MonitorDetail>(`/monitor/${id}`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateMonitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateMonitorPayload) => {
      const { data } = await apiClient.post<ApiResponse<MonitorListItem>>("/monitor", payload)
      return data
    },
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: [MONITORS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateMonitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateMonitorPayload & { id: string }) => {
      const { data } = await apiClient.put<ApiResponse<MonitorListItem>>(`/monitor/${id}`, payload)
      return data
    },
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: [MONITORS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteMonitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete<ApiResponse<null>>(`/monitor/${id}`)
      return data
    },
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: [MONITORS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useTriggerCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<ApiResponse<MonitorCheck>>(`/monitor/${id}/check`)
      return data
    },
    onSuccess: (res) => {
      toast.success("Check completed")
      qc.invalidateQueries({ queryKey: [MONITORS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export interface CheckAllProgress {
  type: 'start' | 'progress' | 'complete' | 'error'
  data: {
    current?: number
    total?: number
    monitorName?: string
    status?: 'ok' | 'error'
    message?: string
    triggered?: number
    failed?: number
    errors?: string[]
  }
}

/** Raw shape sent by the SSE backend (NestJS consumes `type` as the event name) */
interface SsePayload {
  event: 'start' | 'progress' | 'complete' | 'error'
  total?: number
  current?: number
  monitorName?: string
  status?: 'ok' | 'error'
  message?: string
  triggered?: number
  failed?: number
  errors?: string[]
}

export function useTriggerCheckAll(
  onProgress?: (progress: CheckAllProgress) => void,
  onComplete?: () => void,
) {
  const qc = useQueryClient()

  const triggerCheckAllMutation = useCallback(
    () =>
      new Promise<CheckAllProgress['data']>((resolve, reject) => {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

        fetch(`${API_BASE}/monitor/check-all-stream`, {
          headers: { Accept: 'text/event-stream' },
          credentials: 'include',
        }).then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Request failed' }))
            reject(new Error(err.message || 'Request failed'))
            return
          }

          const reader = res.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop()!

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const raw: SsePayload = JSON.parse(line.slice(6))
                  const event: CheckAllProgress = {
                    type: raw.event,
                    data: {
                      current: raw.current,
                      total: raw.total,
                      monitorName: raw.monitorName,
                      status: raw.status,
                      message: raw.message,
                      triggered: raw.triggered,
                      failed: raw.failed,
                      errors: raw.errors,
                    },
                  }
                  onProgress?.(event)

                  if (raw.event === 'complete') {
                    resolve(event.data)
                  } else if (raw.event === 'error') {
                    reject(new Error(raw.message || 'Stream failed'))
                  }
                } catch {
                  // skip malformed lines
                }
              }
            }
          }
        }).catch(reject)
      }),
    [onProgress],
  )

  return useMutation({
    mutationFn: triggerCheckAllMutation,
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: [MONITORS_KEY] })
      onComplete?.()
    },
    onError: (err: Error) => {
      toast.error(err.message)
      onComplete?.()
    },
  })
}

export function useMonitorChecks(monitorId: string | null, page = 1, limit = 50) {
  return useQuery({
    queryKey: [MONITORS_KEY, "checks", monitorId, page, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<MonitorCheck>>(
        `/monitor/${monitorId}/checks`,
        { params: { page, limit } }
      )
      return data
    },
    enabled: !!monitorId,
  })
}
