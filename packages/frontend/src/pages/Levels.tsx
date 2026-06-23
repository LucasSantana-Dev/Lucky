import { reportError } from '@/lib/sentry'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import Skeleton from '@/components/ui/Skeleton'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import { TrashIcon } from 'lucide-react'
import type { MemberXP, LevelReward } from '@/services/levelsApi'
import type { GuildRoleOption } from '@/types'

function Levels() {
    const { t } = useTranslation()
    const { selectedGuild } = useGuildStore()
    const [loading, setLoading] = useState(true)
    const [leaderboard, setLeaderboard] = useState<MemberXP[]>([])
    const [rewards, setRewards] = useState<LevelReward[]>([])
    const [roles, setRoles] = useState<GuildRoleOption[]>([])
    const [rolesError, setRolesError] = useState(false)
    const [saving, setSaving] = useState(false)
    const [adding, setAdding] = useState(false)
    const [newLevel, setNewLevel] = useState('')
    const [newRoleId, setNewRoleId] = useState('')

    // Form state
    const [enabled, setEnabled] = useState(false)
    const [xpPerMessage, setXpPerMessage] = useState(0)
    const [xpCooldownMs, setXpCooldownMs] = useState(0)
    const [announceChannel, setAnnounceChannel] = useState('')

    useEffect(() => {
        if (!selectedGuild) {
            setLoading(false)
            return
        }

        let mounted = true

        const loadData = async () => {
            setLoading(true)
            setRolesError(false)
            try {
                const [configData, leaderboardData, rewardsData, rbacData] =
                    await Promise.all([
                        api.levels.getConfig(selectedGuild.id),
                        api.levels.getLeaderboard(selectedGuild.id, 20),
                        api.levels.getRewards(selectedGuild.id),
                        // RBAC failure is isolated so it can't blank the whole
                        // page, but it must be surfaced (not silently swallowed):
                        // an empty role list then means "failed to load", which
                        // rolesError distinguishes from "no roles configured".
                        api.guilds.getRbac(selectedGuild.id).catch(() => {
                            if (mounted) setRolesError(true)
                            return { data: { roles: [] } }
                        }),
                    ])

                if (!mounted) return

                setLeaderboard(leaderboardData)
                setRewards(rewardsData)
                setRoles(rbacData.data.roles)

                if (configData) {
                    setEnabled(configData.enabled)
                    setXpPerMessage(configData.xpPerMessage)
                    setXpCooldownMs(configData.xpCooldownMs)
                    setAnnounceChannel(configData.announceChannel || '')
                } else {
                    setEnabled(false)
                    setXpPerMessage(0)
                    setXpCooldownMs(0)
                    setAnnounceChannel('')
                }
            } catch (error) {
                if (!mounted) return
                if (error instanceof ApiError) {
                    reportError('Failed to load levels data:', error, {
                        component: 'Levels',
                        action: 'loadData',
                    })
                    toast.error(t('levels.failedToLoadSettings'))
                }
            } finally {
                if (mounted) setLoading(false)
            }
        }

        loadData()
        return () => {
            mounted = false
        }
    }, [selectedGuild?.id])

    const handleSaveSettings = async () => {
        if (!selectedGuild) return

        setSaving(true)
        try {
            await api.levels.updateConfig(selectedGuild.id, {
                enabled,
                xpPerMessage,
                xpCooldownMs,
                announceChannel: announceChannel || null,
            })
            toast.success(t('levels.levelSettingsSaved'))
        } catch (error) {
            reportError('Failed to save level settings:', error, {
                component: 'Levels',
                action: 'saveSettings',
            })
            toast.error('Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    const handleAddReward = async () => {
        if (!selectedGuild || !newLevel || !newRoleId) return

        const levelNum = parseInt(newLevel)
        if (isNaN(levelNum)) return

        setAdding(true)
        try {
            const reward = await api.levels.addReward(selectedGuild.id, {
                level: levelNum,
                roleId: newRoleId,
            })
            setRewards([...rewards, reward])
            setNewLevel('')
            setNewRoleId('')
            toast.success(t('levels.rewardAdded', { level: levelNum }))
        } catch (error) {
            reportError('Failed to add level reward:', error, {
                component: 'Levels',
                action: 'addReward',
            })
            toast.error(t('levels.failedToAddReward'))
        } finally {
            setAdding(false)
        }
    }

    const handleRemoveReward = async (level: number) => {
        if (!selectedGuild) return

        try {
            await api.levels.removeReward(selectedGuild.id, level)
            setRewards(rewards.filter((r) => r.level !== level))
            toast.success(t('levels.rewardRemoved'))
        } catch (error) {
            reportError('Failed to remove level reward:', error, {
                component: 'Levels',
                action: 'removeReward',
            })
            toast.error(t('levels.failedToRemoveReward'))
        }
    }

    if (!selectedGuild) {
        return (
            <div className='flex flex-col items-center justify-center py-12'>
                <div className='text-center'>
                    <p className='text-lg font-semibold text-lucky-text-primary mb-2'>
                        {t('levels.noServerSelected')}
                    </p>
                    <p className='text-sm text-lucky-text-secondary'>
                        {t('levels.selectServerToView')}
                    </p>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <div className='space-y-4'>
                <Skeleton className='h-16 rounded' />
                <Skeleton className='h-32 rounded' />
                <Skeleton className='h-32 rounded' />
            </div>
        )
    }

    const getRoleName = (roleId: string): string => {
        const role = roles.find((r) => r.id === roleId)
        return role?.name || roleId
    }

    return (
        <div className='space-y-6'>
            {/* Leaderboard */}
            <section>
                <h2 className='type-title text-lucky-text-primary mb-4'>
                    {t('levels.leaderboard')}
                </h2>
                {leaderboard.length === 0 ? (
                    <Card className='p-8 text-center border border-lucky-border'>
                        <p className='text-lg font-semibold text-lucky-text-primary mb-2'>
                            {t('levels.noDataYet')}
                        </p>
                        <p className='text-sm text-lucky-text-secondary'>
                            {t('levels.membersGainXp')}
                        </p>
                    </Card>
                ) : (
                    <Card className='overflow-hidden border border-lucky-border'>
                        <div className='divide-y divide-lucky-border'>
                            {leaderboard.map((member) => (
                                <div
                                    key={member.userId}
                                    className='flex items-center justify-between p-4 transition-colors hover:bg-lucky-bg-active/25'
                                >
                                    <div className='flex-1'>
                                        <p className='type-body-sm font-medium text-lucky-text-primary'>
                                            {member.displayName ??
                                                member.userId}
                                        </p>
                                        <p className='type-body-sm text-lucky-text-secondary'>
                                            {t('levels.level')} {member.level}
                                        </p>
                                    </div>
                                    <div className='text-right'>
                                        <p className='type-body-sm font-semibold text-lucky-accent'>
                                            {member.xp.toLocaleString()}{' '}
                                            {t('levels.xp')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}
            </section>

            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                {/* Config Settings */}
                <Card className='p-6 border border-lucky-border'>
                    <h3 className='type-body-sm font-semibold text-lucky-text-primary mb-4 uppercase tracking-wide'>
                        {t('levels.settings')}
                    </h3>
                    <div className='space-y-4'>
                        <div className='flex items-center justify-between'>
                            <Label>{t('levels.enableXp')}</Label>
                            <Switch
                                aria-label={t('levels.enableXp')}
                                checked={enabled}
                                onCheckedChange={setEnabled}
                            />
                        </div>

                        <div>
                            <Label htmlFor='xpPerMsg' className='text-sm'>
                                {t('levels.xpPerMessage')}
                            </Label>
                            <Input
                                id='xpPerMsg'
                                type='number'
                                value={xpPerMessage}
                                onChange={(e) =>
                                    setXpPerMessage(
                                        parseInt(e.target.value) || 0,
                                    )
                                }
                                min='1'
                                max='1000'
                                className='mt-1.5'
                            />
                        </div>

                        <div>
                            <Label htmlFor='cooldown' className='text-sm'>
                                {t('levels.cooldown')}
                            </Label>
                            <Input
                                id='cooldown'
                                type='number'
                                value={xpCooldownMs}
                                onChange={(e) =>
                                    setXpCooldownMs(
                                        parseInt(e.target.value) || 0,
                                    )
                                }
                                className='mt-1.5'
                            />
                        </div>

                        <div>
                            <Label htmlFor='channel' className='text-sm'>
                                {t('levels.announceChannel')}
                            </Label>
                            <Input
                                id='channel'
                                type='text'
                                value={announceChannel}
                                onChange={(e) =>
                                    setAnnounceChannel(e.target.value)
                                }
                                placeholder={t('levels.channelIdOptional')}
                                className='mt-1.5'
                            />
                        </div>

                        <Button
                            onClick={handleSaveSettings}
                            disabled={saving}
                            className='w-full'
                        >
                            {saving
                                ? t('levels.saving')
                                : t('levels.saveSettings')}
                        </Button>
                    </div>
                </Card>

                {/* Rewards */}
                <Card className='p-6 border border-lucky-border'>
                    <h3 className='type-body-sm font-semibold text-lucky-text-primary mb-4 uppercase tracking-wide'>
                        {t('levels.levelRewards')}
                    </h3>

                    {rolesError && (
                        <p className='text-sm text-lucky-error mb-4'>
                            {t('levels.couldNotLoadRoles')}
                        </p>
                    )}

                    <div className='space-y-3 mb-4'>
                        {rewards.length === 0 ? (
                            <p className='text-sm text-lucky-text-secondary'>
                                {t('levels.noRewardsConfigured')}
                            </p>
                        ) : (
                            rewards.map((reward) => (
                                <div
                                    key={reward.id}
                                    className='flex items-center justify-between p-3 rounded bg-lucky-bg-secondary/50'
                                >
                                    <div className='flex-1'>
                                        <p className='text-lucky-brand'>
                                            Lv.{reward.level}
                                        </p>
                                        <p className='text-sm text-lucky-text-secondary'>
                                            {getRoleName(reward.roleId)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleRemoveReward(reward.level)
                                        }
                                        className='p-1.5 hover:bg-lucky-bg-tertiary rounded transition-colors'
                                    >
                                        <TrashIcon className='w-4 h-4 text-lucky-text-secondary hover:text-lucky-brand' />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className='space-y-3 pt-4 border-t border-lucky-border'>
                        <div>
                            <Label htmlFor='newLevel' className='text-sm'>
                                {t('levels.levelLabel')}
                            </Label>
                            <Input
                                id='newLevel'
                                type='number'
                                placeholder={t('levels.levelPlaceholder')}
                                value={newLevel}
                                onChange={(e) => setNewLevel(e.target.value)}
                                className='mt-1.5'
                            />
                        </div>

                        <div>
                            <Label htmlFor='newRole' className='text-sm'>
                                {t('levels.roleIdLabel')}
                            </Label>
                            <Input
                                id='newRole'
                                type='text'
                                placeholder={t('levels.roleIdPlaceholder')}
                                value={newRoleId}
                                onChange={(e) => setNewRoleId(e.target.value)}
                                className='mt-1.5'
                            />
                        </div>

                        <Button
                            onClick={handleAddReward}
                            disabled={adding || !newLevel || !newRoleId}
                            className='w-full'
                        >
                            {adding
                                ? t('levels.adding')
                                : t('levels.addReward')}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    )
}

export default Levels
