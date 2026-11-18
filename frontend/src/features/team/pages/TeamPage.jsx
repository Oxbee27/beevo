import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import {
  createStaff,
  createRole,
  deleteRole,
  getPermissions,
  getRoles,
  getStaff,
  updateRole,
  updateStaff,
  updateStaffStatus,
} from '../services/team.service.js'

const inputClass =
  'mt-2 w-full rounded-lg border border-inkberry/15 bg-white px-3.5 py-3 text-sm text-inkberry outline-none transition-colors placeholder:text-inkberry/35 focus:border-inkberry/60'

const primaryButton =
  'rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory transition-colors hover:bg-inkberry/90 disabled:cursor-not-allowed disabled:opacity-60'

const secondaryButton =
  'rounded-lg border border-inkberry/15 px-5 py-3 text-sm font-medium text-inkberry transition-colors hover:bg-peach-sand/40 disabled:opacity-50'

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '').join('')
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        className={`max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-2xl border border-inkberry/10 bg-warm-ivory p-6 shadow-xl sm:p-7`}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-inkberry">{title}</h2>
            {subtitle && <p className="mt-2 text-sm text-inkberry/60">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg px-2 py-1 text-xl text-inkberry/50 hover:bg-peach-sand/60 hover:text-inkberry"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function StaffDialog({ staff, roles, onClose, onSave }) {
  const [form, setForm] = useState({
    name: staff?.name || '',
    email: staff?.email || '',
    password: '',
    roleId: staff?.role_id ? String(staff.role_id) : '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (form.name.trim().length < 2) {
      setError('Please enter the staff member’s full name.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Please enter a valid email address.')
      return
    }

    if (!staff && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}/.test(form.password)) {
      setError('Use at least 8 characters, including uppercase, lowercase, a number and a special character.')
      return
    }

    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        email: form.email.trim(),
        roleId: form.roleId || null,
      }

      if (!staff) data.password = form.password
      await onSave(data)
      onClose()
    } catch (err) {
      setError(err.message || 'We could not save this staff member. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={staff ? 'Edit staff member' : 'Add a staff member'}
      subtitle={staff ? 'Update this person’s details and assigned role.' : 'Create a staff account for someone in your business.'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-inkberry" htmlFor="staff-name">Full name</label>
          <input id="staff-name" name="name" value={form.name} onChange={change} className={inputClass} placeholder="Enter full name" maxLength={150} required />
        </div>
        <div>
          <label className="text-sm font-medium text-inkberry" htmlFor="staff-email">Email address</label>
          <input id="staff-email" name="email" type="email" value={form.email} onChange={change} className={inputClass} placeholder="name@example.com" maxLength={255} required />
        </div>
        {!staff && (
          <div>
            <label className="text-sm font-medium text-inkberry" htmlFor="staff-password">Temporary password</label>
            <input id="staff-password" name="password" type="password" value={form.password} onChange={change} className={inputClass} placeholder="Create a secure password" required />
            <p className="mt-2 text-xs leading-5 text-inkberry/55">At least 8 characters, with uppercase, lowercase, a number and a special character.</p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-inkberry" htmlFor="staff-role">Assigned role</label>
          <select id="staff-role" name="roleId" value={form.roleId} onChange={change} className={inputClass}>
            <option value="">No custom role</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="rounded-lg bg-peach-sand/60 px-3 py-3 text-sm text-inkberry">{error}</p>}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? 'Saving...' : staff ? 'Save changes' : 'Create staff account'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RoleDialog({ role, permissions, onClose, onSave }) {
  const [form, setForm] = useState({
    name: role?.name || '',
    description: role?.description || '',
    permissions: role?.permissions || [],
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const groups = useMemo(() => {
    const result = {}
    permissions.forEach((permission) => {
      const group = permission.code.split('.')[0] || 'other'
      if (!result[group]) result[group] = []
      result[group].push(permission)
    })
    return result
  }, [permissions])

  function togglePermission(code) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(code)
        ? current.permissions.filter((item) => item !== code)
        : [...current.permissions, code],
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (form.name.trim().length < 2) {
      setError('Please enter a role name.')
      return
    }

    if (form.permissions.length === 0) {
      setError('Select at least one permission for this role.')
      return
    }

    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        permissions: form.permissions,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'We could not save this role. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={role ? 'Edit role' : 'Create a role'}
      subtitle="Choose what members assigned to this role can access."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="role-name" className="text-sm font-medium text-inkberry">Role name</label>
          <input id="role-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="e.g. Sales Assistant" maxLength={100} required />
        </div>
        <div>
          <label htmlFor="role-description" className="text-sm font-medium text-inkberry">Description</label>
          <textarea id="role-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${inputClass} resize-y`} rows={2} maxLength={1000} placeholder="Briefly describe what this role is responsible for." />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-inkberry">Permissions</h3>
            <span className="text-xs text-inkberry/50">{form.permissions.length} selected</span>
          </div>
          {permissions.length === 0 ? (
            <p className="rounded-lg bg-peach-sand/40 p-4 text-sm text-inkberry/70">No permissions are available at the moment.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(groups).map(([group, items]) => (
                <section key={group} className="rounded-xl border border-inkberry/10 bg-white/60 p-4">
                  <h4 className="mb-3 text-sm font-semibold capitalize text-inkberry">{group.replaceAll('_', ' ')}</h4>
                  <div className="space-y-3">
                    {items.map((permission) => (
                      <label key={permission.code} className="flex cursor-pointer items-start gap-2.5 text-sm text-inkberry/75">
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission.code)}
                          onChange={() => togglePermission(permission.code)}
                          className="mt-0.5 h-4 w-4 accent-[#30263D]"
                        />
                        <span>
                          <span className="block font-medium text-inkberry">{permission.description || permission.code}</span>
                          <span className="mt-0.5 block text-xs text-inkberry/45">{permission.code}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg bg-peach-sand/60 px-3 py-3 text-sm text-inkberry">{error}</p>}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={saving || permissions.length === 0} className={primaryButton}>{saving ? 'Saving...' : role ? 'Save role' : 'Create role'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function TeamPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('staff')
  const [staff, setStaff] = useState([])
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(user?.role === 'owner')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showStaffDialog, setShowStaffDialog] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [workingId, setWorkingId] = useState(null)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)

  const isOwner = user?.role === 'owner'

  const loadData = useCallback(async () => {
    try {
      const [staffData, roleData, permissionData] = await Promise.all([
        getStaff(),
        getRoles(),
        getPermissions(),
      ])
      setStaff(staffData)
      setRoles(roleData)
      setPermissions(permissionData)
    } catch (err) {
      setError(err.message || 'We could not load your team. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOwner) void Promise.resolve().then(loadData)
  }, [isOwner, loadData])

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return staff
    return staff.filter((member) =>
      [member.name, member.email, member.role_name].some((value) =>
        String(value || '').toLowerCase().includes(term),
      ),
    )
  }, [staff, search])

  async function saveStaff(data) {
    if (editingStaff) {
      await updateStaff(editingStaff.id, data)
      setNotice('Staff details have been updated.')
    } else {
      await createStaff(data)
      setNotice('Staff account created successfully.')
    }
    setEditingStaff(null)
    setShowStaffDialog(false)
    await loadData()
  }

  function changeStatus(member) {
    setPendingConfirmation({ type: 'status', member })
    setError('')
  }

  async function saveRole(data) {
    if (editingRole) {
      await updateRole(editingRole.id, data)
      setNotice('Role updated successfully.')
    } else {
      await createRole(data)
      setNotice('Role created successfully.')
    }
    setEditingRole(null)
    setShowRoleDialog(false)
    await loadData()
  }

  function removeRole(role) {
    setPendingConfirmation({ type: 'role', role })
    setError('')
  }

  async function confirmPendingAction() {
    if (!pendingConfirmation || workingId !== null) return

    const confirmation = pendingConfirmation
    const targetId = confirmation.type === 'status'
      ? confirmation.member.id
      : confirmation.role.id

    setWorkingId(targetId)
    setError('')
    setNotice('')

    try {
      if (confirmation.type === 'status') {
        const { member } = confirmation
        const nextStatus = !member.is_active
        await updateStaffStatus(member.id, nextStatus)
        setNotice(`${member.name}'s account has been ${nextStatus ? 'activated' : 'deactivated'}.`)
      } else {
        await deleteRole(confirmation.role.id)
        setNotice('Role deleted successfully.')
      }

      setPendingConfirmation(null)
      await loadData()
    } catch (err) {
      setError(
        err.message || (
          confirmation.type === 'status'
            ? 'We could not update this account.'
            : 'This role could not be deleted. Check whether staff members are assigned to it.'
        ),
      )
    } finally {
      setWorkingId(null)
    }
  }

  if (!isOwner) {
    return (
      <section className="rounded-2xl border border-inkberry/10 bg-white/70 p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/45">Team access</p>
        <h1 className="mt-2 text-2xl font-semibold text-inkberry">Owner access required</h1>
        <p className="mt-3 text-sm text-inkberry/65">Only the business owner can manage staff accounts and roles.</p>
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/45">Business workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-inkberry">Team management</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-inkberry/60">Manage the people who help run your business and control what they can access.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice('')
            if (activeTab === 'staff') {
              setEditingStaff(null)
              setShowStaffDialog(true)
            } else {
              setEditingRole(null)
              setShowRoleDialog(true)
            }
          }}
          className={primaryButton}
        >
          {activeTab === 'staff' ? 'Add staff member' : 'Create role'}
        </button>
      </header>

      <div className="flex gap-2 border-b border-inkberry/10">
        <button type="button" onClick={() => { setActiveTab('staff'); setSearch(''); setError(''); setNotice('') }} className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'staff' ? 'border-inkberry text-inkberry' : 'border-transparent text-inkberry/50 hover:text-inkberry'}`}>
          Staff <span className="ml-1 text-xs text-inkberry/45">{staff.length}</span>
        </button>
        <button type="button" onClick={() => { setActiveTab('roles'); setSearch(''); setError(''); setNotice('') }} className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${activeTab === 'roles' ? 'border-inkberry text-inkberry' : 'border-transparent text-inkberry/50 hover:text-inkberry'}`}>
          Roles & permissions <span className="ml-1 text-xs text-inkberry/45">{roles.length}</span>
        </button>
      </div>

      {notice && <p role="status" className="rounded-lg border border-inkberry/10 bg-peach-sand/45 px-4 py-3 text-sm text-inkberry">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-inkberry/10 bg-peach-sand/60 px-4 py-3 text-sm text-inkberry">{error}</p>}

      {loading ? (
        <div className="rounded-2xl border border-inkberry/10 bg-white/60 p-10 text-center text-sm text-inkberry/55">Loading your team...</div>
      ) : activeTab === 'staff' ? (
        <section className="overflow-hidden rounded-2xl border border-inkberry/10 bg-white/70">
          <div className="flex flex-col gap-4 border-b border-inkberry/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-inkberry">Staff members</h2>
              <p className="mt-1 text-sm text-inkberry/55">People with access to this business workspace.</p>
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff..." className="w-full rounded-lg border border-inkberry/15 bg-white px-3.5 py-2.5 text-sm text-inkberry outline-none focus:border-inkberry/60 sm:max-w-xs" />
          </div>

          {filteredStaff.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-peach-sand/60 text-lg text-inkberry">+</div>
              <h3 className="mt-4 font-semibold text-inkberry">{search ? 'No matching staff members' : 'Build your team'}</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-inkberry/55">{search ? 'Try another name, email address or role.' : 'Add a staff member to share the work while keeping control of business access.'}</p>
              {!search && <button type="button" onClick={() => { setEditingStaff(null); setShowStaffDialog(true) }} className={`${primaryButton} mt-5`}>Add your first staff member</button>}
            </div>
          ) : (
            <div className="divide-y divide-inkberry/10">
              {filteredStaff.map((member) => (
                <article key={member.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-peach-sand text-sm font-semibold text-inkberry">{initials(member.name)}</div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-inkberry">{member.name}</h3>
                      <p className="mt-0.5 truncate text-sm text-inkberry/55">{member.email}</p>
                      <p className="mt-1 text-xs text-inkberry/45">{member.role_name || 'No custom role'} · Added {formatDate(member.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${member.is_active ? 'bg-[#e7efe7] text-[#355b3c]' : 'bg-peach-sand/70 text-inkberry/65'}`}>
                      {member.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button type="button" onClick={() => { setEditingStaff(member); setShowStaffDialog(true) }} className={secondaryButton}>Edit</button>
                    <button type="button" disabled={workingId === member.id} onClick={() => changeStatus(member)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-inkberry/65 hover:bg-peach-sand/50 disabled:opacity-50">
                      {workingId === member.id ? 'Updating...' : member.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-inkberry/10 bg-white/70">
          <div className="border-b border-inkberry/10 p-5">
            <h2 className="font-semibold text-inkberry">Custom roles</h2>
            <p className="mt-1 text-sm text-inkberry/55">Define which parts of Beevo each staff role can access.</p>
          </div>
          {roles.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-peach-sand/60 text-lg text-inkberry">+</div>
              <h3 className="mt-4 font-semibold text-inkberry">No custom roles yet</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-inkberry/55">Create roles such as Sales Assistant or Customer Support, then choose the permissions each role needs.</p>
              <button type="button" onClick={() => { setEditingRole(null); setShowRoleDialog(true) }} className={`${primaryButton} mt-5`}>Create your first role</button>
            </div>
          ) : (
            <div className="divide-y divide-inkberry/10">
              {roles.map((role) => (
                <article key={role.id} className="p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-inkberry">{role.name}</h3>
                        <span className="rounded-full bg-peach-sand/60 px-2.5 py-1 text-xs text-inkberry/65">{role.assigned_staff_count || 0} assigned</span>
                      </div>
                      <p className="mt-1 text-sm text-inkberry/55">{role.description || 'No description provided.'}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(role.permissions || []).slice(0, 6).map((permission) => (
                          <span key={permission} className="rounded-md border border-inkberry/10 bg-white px-2 py-1 text-xs text-inkberry/60">{permission}</span>
                        ))}
                        {(role.permissions || []).length > 6 && <span className="px-1 py-1 text-xs text-inkberry/45">+{role.permissions.length - 6} more</span>}
                        {(role.permissions || []).length === 0 && <span className="text-xs text-inkberry/45">No permissions assigned</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => { setEditingRole(role); setShowRoleDialog(true) }} className={secondaryButton}>Edit</button>
                      <button type="button" disabled={workingId === role.id} onClick={() => removeRole(role)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-inkberry/65 hover:bg-peach-sand/50 disabled:opacity-50">{workingId === role.id ? 'Deleting...' : 'Delete'}</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {pendingConfirmation && (
        <ConfirmDialog
          title={
            pendingConfirmation.type === 'status'
              ? `${pendingConfirmation.member.is_active ? 'Deactivate' : 'Activate'} staff account?`
              : 'Delete custom role?'
          }
          message={
            pendingConfirmation.type === 'status'
              ? `${pendingConfirmation.member.is_active ? 'Deactivate' : 'Activate'} ${pendingConfirmation.member.name}'s account?`
              : `Delete the "${pendingConfirmation.role.name}" role? This action cannot be undone.`
          }
          confirmLabel={
            pendingConfirmation.type === 'status'
              ? pendingConfirmation.member.is_active ? 'Deactivate account' : 'Activate account'
              : 'Delete role'
          }
          loading={workingId !== null}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={confirmPendingAction}
        />
      )}

      {showStaffDialog && (
        <StaffDialog
          staff={editingStaff}
          roles={roles}
          onClose={() => { setShowStaffDialog(false); setEditingStaff(null) }}
          onSave={saveStaff}
        />
      )}

      {showRoleDialog && (
        <RoleDialog
          role={editingRole}
          permissions={permissions}
          onClose={() => { setShowRoleDialog(false); setEditingRole(null) }}
          onSave={saveRole}
        />
      )}
    </div>
  )
}
