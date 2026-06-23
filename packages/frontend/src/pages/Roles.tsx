import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Plus, Trash2, Copy, Edit2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import SectionHeader from '@/components/ui/SectionHeader'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import { reportError } from '@/lib/sentry'
import type { GuildRoleManage, RoleUpsertData } from '@/services/rolesManageApi'

const SKELETON_KEYS = ['role-loading-1', 'role-loading-2', 'role-loading-3']

function intToHex(color: number): string {
    if (color === 0) return ''
    return '#' + color.toString(16).padStart(6, '0').toUpperCase()
}

function hexToInt(hex: string): number {
    if (!hex || hex === '') return 0
    return parseInt(hex.slice(1), 16)
}

interface RoleFormData {
    name: string
    color: string
    hoist: boolean
    mentionable: boolean
}

function RoleDialog({
    open,
    title,
    role,
    onOpenChange,
    onSave,
    isSaving,
}: {
    open: boolean
    title: string
    role?: GuildRoleManage | null
    onOpenChange: (open: boolean) => void
    onSave: (data: RoleFormData) => Promise<void>
    isSaving: boolean
}) {
    const { t } = useTranslation()
    const [formData, setFormData] = useState<RoleFormData>({
        name: '',
        color: '',
        hoist: false,
        mentionable: false,
    })

    useEffect(() => {
        if (role) {
            setFormData({
                name: role.name,
                color: intToHex(role.color),
                hoist: role.hoist,
                mentionable: role.mentionable,
            })
        } else {
            setFormData({
                name: '',
                color: '',
                hoist: false,
                mentionable: false,
            })
        }
    }, [role, open])

    const handleSave = async () => {
        if (!formData.name.trim()) {
            toast.error(t('common.error') || 'Please enter a role name')
            return
        }
        await onSave(formData)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {role
                            ? t('roles.editRole') || 'Edit role'
                            : t('roles.createRole') || 'Create a new role'}
                    </DialogDescription>
                </DialogHeader>

                <div className='space-y-4'>
                    <div>
                        <Label htmlFor='role-name'>
                            {t('common.name') || 'Name'}
                        </Label>
                        <Input
                            id='role-name'
                            value={formData.name}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    name: e.target.value,
                                })
                            }
                            placeholder='Role name'
                        />
                    </div>

                    <div>
                        <Label htmlFor='role-color'>
                            {t('common.color') || 'Color'}
                        </Label>
                        <input
                            id='role-color'
                            type='color'
                            value={formData.color || '#000000'}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    color: e.target.value,
                                })
                            }
                            className='h-10 w-full rounded border'
                        />
                    </div>

                    <div className='flex items-center justify-between'>
                        <Label htmlFor='role-hoist'>
                            {t('roles.hoist') || 'Hoist'}
                        </Label>
                        <Switch
                            id='role-hoist'
                            checked={formData.hoist}
                            onCheckedChange={(checked) =>
                                setFormData({
                                    ...formData,
                                    hoist: checked,
                                })
                            }
                        />
                    </div>

                    <div className='flex items-center justify-between'>
                        <Label htmlFor='role-mentionable'>
                            {t('roles.mentionable') || 'Mentionable'}
                        </Label>
                        <Switch
                            id='role-mentionable'
                            checked={formData.mentionable}
                            onCheckedChange={(checked) =>
                                setFormData({
                                    ...formData,
                                    mentionable: checked,
                                })
                            }
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant='secondary'
                        onClick={() => onOpenChange(false)}
                    >
                        {t('common.cancel') || 'Cancel'}
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving
                            ? t('common.loading') || 'Saving...'
                            : t('common.save') || 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function ConfirmDialog({
    open,
    title,
    description,
    onConfirm,
    onCancel,
    isLoading,
}: {
    open: boolean
    title: string
    description: string
    onConfirm: () => void
    onCancel: () => void
    isLoading: boolean
}) {
    const { t } = useTranslation()
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant='secondary' onClick={onCancel}>
                        {t('common.cancel') || 'Cancel'}
                    </Button>
                    <Button
                        variant='destructive'
                        onClick={onConfirm}
                        disabled={isLoading}
                    >
                        {isLoading
                            ? t('common.loading') || 'Deleting...'
                            : t('common.delete') || 'Delete'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function RolesPage() {
    const { t } = useTranslation()
    const { selectedGuild } = useGuildStore()
    const guildId = selectedGuild?.id
    const [roles, setRoles] = useState<GuildRoleManage[]>([])
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [showEditDialog, setShowEditDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
    const [editingRole, setEditingRole] = useState<GuildRoleManage | null>(null)
    const [deletingRole, setDeletingRole] = useState<GuildRoleManage | null>(
        null,
    )
    const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
        new Set(),
    )

    const loadRoles = useCallback(async () => {
        if (!guildId) {
            setLoading(false)
            return
        }

        setLoading(true)
        try {
            const data = await api.rolesManage.list(guildId)
            if (data) {
                const sorted = [...data].sort((a, b) => b.position - a.position)
                setRoles(sorted)
            }
        } catch (error) {
            if (error instanceof Error) {
                reportError('Failed to load roles:', error, {
                    component: 'RolesPage',
                    action: 'loadRoles',
                })
            }
            toast.error(t('roles.failedToLoad') || 'Failed to load roles')
        } finally {
            setLoading(false)
        }
    }, [guildId, t])

    useEffect(() => {
        loadRoles()
    }, [loadRoles])

    const handleCreateRole = async (formData: RoleFormData) => {
        if (!guildId) return

        setIsSaving(true)
        try {
            const roleData: RoleUpsertData = {
                name: formData.name,
                color: formData.color ? hexToInt(formData.color) : undefined,
                hoist: formData.hoist,
                mentionable: formData.mentionable,
            }

            const newRole = await api.rolesManage.create(guildId, roleData)
            if (newRole) {
                setRoles((prev) =>
                    [...prev, newRole].sort((a, b) => b.position - a.position),
                )
                toast.success(t('roles.created') || 'Role created')
                setShowCreateDialog(false)
            } else {
                toast.error(
                    t('roles.failedToCreate') || 'Failed to create role',
                )
            }
        } catch (error) {
            if (error instanceof Error) {
                reportError('Failed to create role:', error, {
                    component: 'RolesPage',
                    action: 'createRole',
                })
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleUpdateRole = async (formData: RoleFormData) => {
        if (!guildId || !editingRole) return

        setIsSaving(true)
        try {
            const roleData: RoleUpsertData = {
                name: formData.name,
                color: formData.color ? hexToInt(formData.color) : undefined,
                hoist: formData.hoist,
                mentionable: formData.mentionable,
            }

            const updated = await api.rolesManage.update(
                guildId,
                editingRole.id,
                roleData,
            )
            if (updated) {
                setRoles((prev) =>
                    prev.map((r) => (r.id === editingRole.id ? updated : r)),
                )
                toast.success(t('roles.updated') || 'Role updated')
                setShowEditDialog(false)
                setEditingRole(null)
            } else {
                toast.error(
                    t('roles.failedToUpdate') || 'Failed to update role',
                )
            }
        } catch (error) {
            if (error instanceof Error) {
                reportError('Failed to update role:', error, {
                    component: 'RolesPage',
                    action: 'updateRole',
                })
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteRole = async () => {
        if (!guildId || !deletingRole) return

        setIsSaving(true)
        try {
            const success = await api.rolesManage.delete(
                guildId,
                deletingRole.id,
            )
            if (success) {
                setRoles((prev) => prev.filter((r) => r.id !== deletingRole.id))
                toast.success(t('roles.deleted') || 'Role deleted')
                setShowDeleteDialog(false)
                setDeletingRole(null)
            } else {
                toast.error(
                    t('roles.failedToDelete') || 'Failed to delete role',
                )
            }
        } catch (error) {
            if (error instanceof Error) {
                reportError('Failed to delete role:', error, {
                    component: 'RolesPage',
                    action: 'deleteRole',
                })
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleDuplicateRole = async (role: GuildRoleManage) => {
        if (!guildId) return

        try {
            const duplicated = await api.rolesManage.duplicate(guildId, role.id)
            if (duplicated) {
                setRoles((prev) =>
                    [...prev, duplicated].sort(
                        (a, b) => b.position - a.position,
                    ),
                )
                toast.success(t('roles.duplicated') || 'Role duplicated')
            } else {
                toast.error(
                    t('roles.failedToDuplicate') || 'Failed to duplicate role',
                )
            }
        } catch (error) {
            if (error instanceof Error) {
                reportError('Failed to duplicate role:', error, {
                    component: 'RolesPage',
                    action: 'duplicateRole',
                })
            }
        }
    }

    const handleBulkDelete = async () => {
        if (!guildId || selectedRoleIds.size === 0) return

        setIsSaving(true)
        try {
            const result = await api.rolesManage.bulkDelete(
                guildId,
                Array.from(selectedRoleIds),
            )
            if (result) {
                setRoles((prev) =>
                    prev.filter((r) => !result.deleted.includes(r.id)),
                )
                setSelectedRoleIds(new Set())
                toast.success(
                    t('roles.bulkDeleted', { count: result.deleted.length }) ||
                        `${result.deleted.length} roles deleted`,
                )
                setShowBulkDeleteDialog(false)
                if (result.failed.length > 0) {
                    toast.error(
                        t('roles.bulkDeleteFailed', {
                            count: result.failed.length,
                        }) || `Failed to delete ${result.failed.length} roles`,
                    )
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                reportError('Failed to bulk delete roles:', error, {
                    component: 'RolesPage',
                    action: 'bulkDeleteRoles',
                })
            }
        } finally {
            setIsSaving(false)
        }
    }

    const toggleRoleSelection = (roleId: string) => {
        const role = roles.find((r) => r.id === roleId)
        if (role?.managed) return

        const newSelected = new Set(selectedRoleIds)
        if (newSelected.has(roleId)) {
            newSelected.delete(roleId)
        } else {
            newSelected.add(roleId)
        }
        setSelectedRoleIds(newSelected)
    }

    if (loading) {
        return (
            <div className='space-y-6'>
                <SectionHeader
                    title={t('roles.title') || 'Roles'}
                    description={
                        t('roles.subtitle') || 'Manage your server roles'
                    }
                />
                <div className='grid gap-4'>
                    {SKELETON_KEYS.map((key) => (
                        <Skeleton key={key} className='h-16 w-full' />
                    ))}
                </div>
            </div>
        )
    }

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Users className='h-10 w-10' />}
                title={t('common.selectServer') || 'Select a server'}
                description={
                    t('common.selectServerDesc') ||
                    'Please select a server to manage roles'
                }
            />
        )
    }

    if (roles.length === 0) {
        return (
            <div className='space-y-6'>
                <SectionHeader
                    title={t('roles.title') || 'Roles'}
                    description={
                        t('roles.subtitle') || 'Manage your server roles'
                    }
                />
                <EmptyState
                    icon={<Users className='h-10 w-10' />}
                    title={t('roles.noRoles') || 'No roles found'}
                    description={
                        t('roles.noRolesDesc') ||
                        'Create your first role to get started'
                    }
                />
                <div className='flex justify-center'>
                    <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className='mr-2 h-4 w-4' />
                        {t('roles.createRole') || 'Create Role'}
                    </Button>
                </div>

                <RoleDialog
                    open={showCreateDialog}
                    title={t('roles.createRole') || 'Create Role'}
                    onOpenChange={setShowCreateDialog}
                    onSave={handleCreateRole}
                    isSaving={isSaving}
                />
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            <div className='flex items-center justify-between'>
                <SectionHeader
                    title={t('roles.title') || 'Roles'}
                    description={
                        t('roles.subtitle') || 'Manage your server roles'
                    }
                />
                <Button
                    onClick={() => setShowCreateDialog(true)}
                    className='shrink-0'
                >
                    <Plus className='mr-2 h-4 w-4' />
                    {t('roles.createRole') || 'Create Role'}
                </Button>
            </div>

            <AnimatePresence>
                {selectedRoleIds.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className='fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-center justify-between z-50'
                    >
                        <span className='text-sm font-medium'>
                            {t('roles.selectedCount', {
                                count: selectedRoleIds.size,
                            }) || `${selectedRoleIds.size} roles selected`}
                        </span>
                        <Button
                            variant='destructive'
                            size='sm'
                            onClick={() => setShowBulkDeleteDialog(true)}
                        >
                            <Trash2 className='mr-2 h-4 w-4' />
                            {t('roles.delete') || 'Delete'}
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                <div className='space-y-2'>
                    {roles.map((role) => (
                        <motion.div
                            key={role.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <Card className='p-4 flex items-center justify-between border border-lucky-border transition-colors hover:bg-lucky-bg-active/25 group'>
                                <div className='flex items-center gap-4 flex-1'>
                                    <Checkbox
                                        checked={selectedRoleIds.has(role.id)}
                                        onCheckedChange={() =>
                                            toggleRoleSelection(role.id)
                                        }
                                        disabled={role.managed}
                                    />

                                    <div
                                        className='h-4 w-4 rounded-full border'
                                        style={{
                                            backgroundColor:
                                                role.color === 0
                                                    ? 'rgb(113, 118, 131)'
                                                    : `#${role.color
                                                          .toString(16)
                                                          .padStart(6, '0')}`,
                                        }}
                                    />

                                    <div className='flex-1'>
                                        <div className='font-semibold'>
                                            {role.name}
                                        </div>
                                        <div className='text-xs text-zinc-400'>
                                            Position: {role.position}
                                        </div>
                                    </div>

                                    <div className='flex items-center gap-2'>
                                        {role.hoist && (
                                            <Badge variant='secondary'>
                                                {t('roles.hoist') || 'Hoist'}
                                            </Badge>
                                        )}
                                        {role.mentionable && (
                                            <Badge variant='secondary'>
                                                {t('roles.mentionable') ||
                                                    'Mentionable'}
                                            </Badge>
                                        )}
                                        {role.managed && (
                                            <Badge
                                                variant='secondary'
                                                className='bg-amber-500/10 text-amber-400 border-amber-500/30'
                                            >
                                                {t('roles.managed') ||
                                                    'Managed'}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {!role.managed && (
                                    <div className='flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4'>
                                        <Button
                                            size='sm'
                                            variant='ghost'
                                            onClick={() => {
                                                setEditingRole(role)
                                                setShowEditDialog(true)
                                            }}
                                        >
                                            <Edit2 className='h-4 w-4' />
                                        </Button>
                                        <Button
                                            size='sm'
                                            variant='ghost'
                                            onClick={() =>
                                                handleDuplicateRole(role)
                                            }
                                        >
                                            <Copy className='h-4 w-4' />
                                        </Button>
                                        <Button
                                            size='sm'
                                            variant='ghost'
                                            onClick={() => {
                                                setDeletingRole(role)
                                                setShowDeleteDialog(true)
                                            }}
                                        >
                                            <Trash2 className='h-4 w-4' />
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </AnimatePresence>

            <RoleDialog
                open={showCreateDialog}
                title={t('roles.createRole') || 'Create Role'}
                role={null}
                onOpenChange={setShowCreateDialog}
                onSave={handleCreateRole}
                isSaving={isSaving}
            />

            <RoleDialog
                open={showEditDialog}
                title={t('roles.editRole') || 'Edit Role'}
                role={editingRole}
                onOpenChange={setShowEditDialog}
                onSave={handleUpdateRole}
                isSaving={isSaving}
            />

            <ConfirmDialog
                open={showDeleteDialog}
                title={t('roles.deleteConfirm') || 'Delete role?'}
                description={
                    deletingRole
                        ? `${t('roles.deleteConfirmDesc') || 'Are you sure you want to delete'} "${deletingRole.name}"?`
                        : ''
                }
                onConfirm={handleDeleteRole}
                onCancel={() => {
                    setShowDeleteDialog(false)
                    setDeletingRole(null)
                }}
                isLoading={isSaving}
            />

            <ConfirmDialog
                open={showBulkDeleteDialog}
                title={t('roles.bulkDeleteConfirm', {
                    count: selectedRoleIds.size,
                })}
                description={`${t('roles.bulkDeleteConfirmDesc') || 'Delete'} ${selectedRoleIds.size} ${t('roles.roles') || 'roles'}?`}
                onConfirm={handleBulkDelete}
                onCancel={() => setShowBulkDeleteDialog(false)}
                isLoading={isSaving}
            />
        </div>
    )
}
