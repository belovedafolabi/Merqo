'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { PermissionGroup } from '@/lib/roles/queries'

/**
 * The role builder's permission checklist — grouped by resource per
 * Milestone 11's Implementation Notes ("grouped and readable... rather than
 * a flat, unstructured list of 50+ checkboxes").
 *
 * A permission the author does not personally hold org-wide renders
 * DISABLED with an explanatory hint. This is a UX mirror of
 * user_grants_cover_role() (20260824090250) and the WITH CHECK conjunct in
 * 20260824090800_alter_role_permissions_add_authoring_policies.sql — not a
 * second copy of the rule. If this list and the RLS predicate ever disagree,
 * RLS wins and the submit simply fails with the server's error; nothing here
 * is trusted as the boundary. Making the escalation impossible to even
 * attempt through the UI is worth doing anyway, so the author never learns
 * about the rule via a rejected submission.
 */
export function PermissionChecklist({
  groups,
  selectedKeys,
  ownKeys,
  onChange,
}: {
  groups: PermissionGroup[]
  selectedKeys: Set<string>
  ownKeys: Set<string>
  onChange: (keys: Set<string>) => void
}) {
  function toggle(key: string, checked: boolean) {
    const next = new Set(selectedKeys)
    if (checked) next.add(key)
    else next.delete(key)
    onChange(next)
  }

  function toggleGroup(group: PermissionGroup, checked: boolean) {
    const next = new Set(selectedKeys)
    for (const permission of group.permissions) {
      if (!ownKeys.has(permission.key)) continue // never select-all past what the author holds
      if (checked) next.add(permission.key)
      else next.delete(permission.key)
    }
    onChange(next)
  }

  return (
    <div className="flex max-h-96 flex-col gap-5 overflow-y-auto pr-1">
      {groups.map((group) => {
        const ownableInGroup = group.permissions.filter((p) => ownKeys.has(p.key))
        const allSelected =
          ownableInGroup.length > 0 && ownableInGroup.every((p) => selectedKeys.has(p.key))

        return (
          <div key={group.resource} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-body-sm font-semibold capitalize">
                {group.resource.replace(/_/g, ' ')}
              </h3>
              {ownableInGroup.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => toggleGroup(group, !allSelected)}
                >
                  {allSelected ? 'Clear' : 'Select all'}
                </button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {group.permissions.map((permission) => {
                const owned = ownKeys.has(permission.key)
                const checked = selectedKeys.has(permission.key)

                return (
                  <div key={permission.key} className="flex items-start gap-2">
                    <Checkbox
                      id={`permission-${permission.key}`}
                      checked={checked}
                      disabled={!owned}
                      onCheckedChange={(value) => toggle(permission.key, value === true)}
                      // Hidden native input so a plain <form action> submits
                      // this selection without wiring a controlled checkbox
                      // per name — the checklist can have 50+ entries, and a
                      // manual name="permissionKeys" checkbox per item would
                      // need the same Set-driven checked state anyway.
                    />
                    {checked && <input type="hidden" name="permissionKeys" value={permission.key} />}
                    <Label
                      htmlFor={`permission-${permission.key}`}
                      className={!owned ? 'text-muted-foreground' : undefined}
                      title={
                        owned
                          ? permission.description ?? undefined
                          : "You don't hold this permission, so you can't grant it to a role."
                      }
                    >
                      {permission.action.replace(/_/g, ' ')}
                    </Label>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
