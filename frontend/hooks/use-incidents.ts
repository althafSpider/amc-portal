"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import apiClient from "@/lib/api-client"
import type {
  IncidentListItem,
  PaginatedResponse,
  ApiResponse,
  ListIncidentsParams,
} from "@/types/api"

const INCIDENTS_KEY = "incidents"

export function useIncidents(params: ListIncidentsParams) {
  return useQuery({
    queryKey: [INCIDENTS_KEY, "list", params],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<IncidentListItem>>("/incident/list", { params })
      return data
    },
    placeholderData: (prev) => prev,
  })
}

export function useIncident(id: string | null) {
  return useQuery({
    queryKey: [INCIDENTS_KEY, id],
    queryFn: async () => {
      const { data } = await apiClient.get<IncidentListItem>(`/incident/${id}`)
      return data
    },
    enabled: !!id,
  })
}

export function useResolveIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<ApiResponse<IncidentListItem>>(`/incident/${id}/resolve`)
      return data
    },
    onSuccess: (res) => {
      toast.success("Incident resolved")
      qc.invalidateQueries({ queryKey: [INCIDENTS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAcknowledgeIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<ApiResponse<IncidentListItem>>(`/incident/${id}/acknowledge`)
      return data
    },
    onSuccess: (res) => {
      toast.success("Incident acknowledged")
      qc.invalidateQueries({ queryKey: [INCIDENTS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete<ApiResponse<null>>(`/incident/${id}`)
      return data
    },
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: [INCIDENTS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useBulkDeleteIncidents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data } = await apiClient.post<ApiResponse<{ deleted: number }>>(`/incident/bulk-delete`, { ids })
      return data
    },
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: [INCIDENTS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCheckExpiredIncidents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{
        domain_incidents: number
        ssl_incidents: number
      }>('/incident/check-expired')
      return data
    },
    onSuccess: (res) => {
      const total = res.domain_incidents + res.ssl_incidents
      if (total > 0) {
        toast.success(`Created ${total} incident(s) for expired resources (${res.domain_incidents} domains, ${res.ssl_incidents} SSL)`)
      } else {
        toast.info('No new expired resources found')
      }
      qc.invalidateQueries({ queryKey: [INCIDENTS_KEY] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
