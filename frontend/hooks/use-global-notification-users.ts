"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import apiClient from "@/lib/api-client"

export interface GlobalNotificationUser {
  user_id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

const GLOBAL_USERS_KEY = "global-notification-users"

export function useGlobalNotificationUsers() {
  const queryClient = useQueryClient()

  const list = useQuery({
    queryKey: [GLOBAL_USERS_KEY],
    queryFn: async () => {
      const { data } = await apiClient.get<GlobalNotificationUser[]>("/global-notification-users")
      return data
    },
  })

  const add = useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await apiClient.post("/global-notification-users", { user_id: userId })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GLOBAL_USERS_KEY] })
      toast.success("User added to global notification recipients")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await apiClient.delete(`/global-notification-users/${userId}`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GLOBAL_USERS_KEY] })
      toast.success("User removed from global notification recipients")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return { list, add, remove }
}
