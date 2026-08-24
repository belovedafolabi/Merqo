import { AdminTopbar } from '@/components/shell/admin-topbar'
import { SettingsNav } from '@/components/settings/settings-nav'

/**
 * The /settings hub — the destination lib/shell/nav-items.ts's "Settings"
 * item has pointed at since Milestone 04 without a route behind it.
 * Organization profile, branding, and receipt configuration all share this
 * shell; each screen owns its own permission check (all currently
 * `organizations.update`) rather than this layout gating once, since a
 * later screen added here might need a different one.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminTopbar title="Settings" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <SettingsNav />
        {children}
      </div>
    </div>
  )
}
