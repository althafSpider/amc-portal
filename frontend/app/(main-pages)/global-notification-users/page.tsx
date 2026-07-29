import { Suspense } from "react"
import Loading from "@/components/common/loader"
import { GlobalNotificationUsersContent } from "@/components/notifications/global-notification-users-content"

export default function GlobalNotificationUsersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GlobalNotificationUsersContent />
    </Suspense>
  )
}
