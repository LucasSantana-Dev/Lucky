import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Star, Zap, Settings, Plus, Trash2, Save, Loader2, Hash } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import SectionHeader from '@/components/ui/SectionHeader'
import { toast } from 'sonner'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import type { MemberXP, LevelReward } from '@/services/levelsApi'
import { xpNeededForLevel } from '@/services/levelsApi'
import type { GuildRoleOption } from '@/types'

function XpBar({ xp, level }: { xp: number; level: number }) {
    const needed = xpNeededForLevel(level + 1)
    const prev = xpNeededForLevel(level)
    const progress = needed > prev ? Math.min(((xp - prev) / (needed - prev)) * 100, 100) : 100
    return (
        <div className='mt-1 h-1.5 rounded-full bg-lucky-bg-active/60 overflow-hidden'>
            <div
                className='h-full rounded-full transition-all duration-500'
                style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #8b5cf6 0%, #d4a017 100%)',
                }}
            />
        </div>
    )
}

function LeaderboardRow({ entry, index }: { entry: MemberXP; index: number }) {
    const medals = ['🥇', '🥈', '🥉']
    const medal = medals[index] ?? null

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className='flex items-center gap-3 p-3 rounded-lg bg-lucky-bg-secondary/60 border border-lucky-border'
        >
            <div className='w-8 text-center text-sm font-bold text-lucky-text-muted'>
                {medal ?? `#${index + 1}`}
            </div>
            <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                    <span className='text-sm font-medium text-lucky-text-body truncate'>
                        {entry.userId}
                    </span>
                    <Badge variant='secondary' className='text-xs shrink-0'>
                        Lv.{entry.level}
                    </Badge>
                </div>
                <XpBar xp={entry.xp} level={entry.level} />
                <p className='text-xs text-lucky-text-muted mt-1'>{entry.xp.toLocaleString()} XP</p>
            </div>
        </motion.div>
    )
}

function SkeletonRow() {
    return (
        <div className='flex items-center gap-3 p-3 rounded-lg bg-lucky-bg-secondary/60 border border-lucky-border'>
            <Skeleton className='h-5 w-8 rounded' />
            <div className='flex-1 space-y-2'>
                <Skeleton className='h-4 w-32 rounded' />
                <Skeleton className='h-1.5 w-full rounded-full' />
            </div>
        </div>
    )
}

export default function Levels() {
    const { selectedGuild } = useGuildStore()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [leaderboard, setLeaderboard] = useState<MemberXP[]>([])
    const [rewards, setRewards] = useState<LevelReward[]>([])
    const [roles, setRoles] = useState<GuildRoleOption[]>([])

    // Config form state
    const [enabled, setEnabled] = useState(false)
    const [xpPerMessage, setXpPerMessage] = useState('15')
    const [xpCooldownMs, setXpCooldownMs] = useState('60000')
    const [announceChannel, setAnnounceChannel] = useState('')

    // Reward form state
    const [newRewardLevel, setNewRewardLevel] = useState('')
    const [newRewardRoleId, setNewRewardRoleId] = useState('')
    const [addingReward, setAddingReward] = useState(false)

    const fetchData = useCallback(async () => {
        if (!selectedGuild) return
        setLoading(true)
        try {
            const [cfg, lb, rwd, rbac] = await Promise.all([
                api.levels.getConfig(selectedGuild.id),
                api.levels.getLeaderboard(selectedGuild.id, 20),
                api.levels.getRewards(selectedGuild.id),
                api.guilds.getRbac(selectedGuild.id).then(r => r.data.roles).catch(() => [] as GuildRoleOption[]),
            ])
            setLeaderboard(lb)
            setRewards(rwd)
            setRoles(rbac)
            if (cfg) {
                setEnabled(cfg.enabled)
                setXpPerMessage(String(cfg.xpPerMessage))
                setXpCooldownMs(String(cfg.xpCooldownMs))
                setAnnounceChannel(cfg.announceChannel ?? '')
            }
        } catch (err) {
            if (err instanceof ApiError && err.status !== 404) {
                toast.error('Failed to load level settings')
            }
        } finally {
            setLoading(false)
        }
    }, [selectedGuild])

    useEffect(() => {
        void fetchData()
    }, [fetchData])

    const handleSaveConfig = async () => {
        if (!selectedGuild) return
        setSaving(true)
        try {
            await api.levels.updateConfig(selectedGuild.id, {
                enabled,
                xpPerMessage: Number(xpPerMessage) || 15,
                xpCooldownMs: Number(xpCooldownMs) || 60000,
                announceChannel: announceChannel.trim() || null,
            })
            toast.success('Level settings saved')
        } catch {
            toast.error('Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    const handleAddReward = async () => {
        if (!selectedGuild || !newRewardLevel || !newRewardRoleId) return
        setAddingReward(true)
        try {
            const reward = await api.levels.addReward(selectedGuild.id, {
                level: Number(newRewardLevel),
                roleId: newRewardRoleId,
            })
            setRewards(prev => [...prev, reward].sort((a, b) => a.level - b.level))
            setNewRewardLevel('')
            setNewRewardRoleId('')
            toast.success(`Reward added for level ${reward.level}`)
        } catch {
            toast.error('Failed to add reward')
        } finally {
            setAddingReward(false)
        }
    }

    const handleRemoveReward = async (level: number) => {
        if (!selectedGuild) return
        try {
            await api.levels.removeReward(selectedGuild.id, level)
            setRewards(prev => prev.filter(r => r.level !== level))
            toast.success('Reward removed')
        } catch {
            toast.error('Failed to remove reward')
        }
    }

    if (!selectedGuild) {
        return (
            <EmptyState
                icon={<Trophy className='h-8 w-8' />}
                title='No server selected'
                description='Select a server to view level settings'
            />
        )
    }

    return (
        <div className='space-y-6'>
            <SectionHeader
                title='Level System'
                description='XP leaderboard, role rewards, and level settings'
            />

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                {/* Leaderboard */}
                <div className='lg:col-span-2 space-y-3'>
                    <h3 className='text-sm font-semibold text-lucky-text-muted uppercase tracking-wider flex items-center gap-2'>
                        <Star size={14} />
                        Leaderboard
                    </h3>
                    {loading ? (
                        <div className='space-y-2'>
                            {Array.from({ length: 5 }).map((_, i) => (
                                <SkeletonRow key={i} />
                            ))}
                        </div>
                    ) : leaderboard.length === 0 ? (
                        <EmptyState
                            icon={<Trophy className='h-8 w-8' />}
                            title='No data yet'
                            description='Members gain XP by chatting once the level system is enabled'
                        />
                    ) : (
                        <div className='space-y-2'>
                            <AnimatePresence>
                                {leaderboard.map((entry, i) => (
                                    <LeaderboardRow key={entry.id} entry={entry} index={i} />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* Settings panel */}
                <div className='space-y-4'>
                    {/* Config card */}
                    <Card className='p-4 space-y-4'>
                        <h3 className='text-sm font-semibold text-lucky-text-muted uppercase tracking-wider flex items-center gap-2'>
                            <Settings size={14} />
                            Settings
                        </h3>

                        <div className='flex items-center justify-between'>
                            <Label htmlFor='lvl-enabled' className='text-lucky-text-body text-sm'>
                                Enable XP
                            </Label>
                            <Switch
                                id='lvl-enabled'
                                checked={enabled}
                                onCheckedChange={setEnabled}
                            />
                        </div>

                        <div className='space-y-1'>
                            <Label className='text-xs text-lucky-text-muted'>XP per message</Label>
                            <Input
                                type='number'
                                min={1}
                                max={1000}
                                value={xpPerMessage}
                                onChange={e => setXpPerMessage(e.target.value)}
                            />
                        </div>

                        <div className='space-y-1'>
                            <Label className='text-xs text-lucky-text-muted'>Cooldown (ms)</Label>
                            <Input
                                type='number'
                                min={1000}
                                value={xpCooldownMs}
                                onChange={e => setXpCooldownMs(e.target.value)}
                            />
                        </div>

                        <div className='space-y-1'>
                            <Label className='text-xs text-lucky-text-muted flex items-center gap-1'>
                                <Hash size={12} /> Announce channel ID
                            </Label>
                            <Input
                                placeholder='Channel ID (optional)'
                                value={announceChannel}
                                onChange={e => setAnnounceChannel(e.target.value)}
                            />
                        </div>

                        <Button
                            onClick={handleSaveConfig}
                            disabled={saving}
                            className='w-full'
                        >
                            {saving ? (
                                <Loader2 size={14} className='animate-spin' />
                            ) : (
                                <Save size={14} />
                            )}
                            Save Settings
                        </Button>
                    </Card>

                    {/* Rewards card */}
                    <Card className='p-4 space-y-4'>
                        <h3 className='text-sm font-semibold text-lucky-text-muted uppercase tracking-wider flex items-center gap-2'>
                            <Zap size={14} />
                            Role Rewards
                        </h3>

                        <div className='space-y-2'>
                            {rewards.length === 0 ? (
                                <p className='text-xs text-lucky-text-subtle'>No rewards configured</p>
                            ) : (
                                rewards.map(r => {
                                    const role = roles.find(ro => ro.id === r.roleId)
                                    return (
                                        <div
                                            key={r.id}
                                            className='flex items-center justify-between gap-2 p-2 rounded bg-lucky-bg-secondary/50 border border-lucky-border'
                                        >
                                            <div className='text-xs text-lucky-text-body'>
                                                <span className='font-semibold text-lucky-brand'>Lv.{r.level}</span>
                                                {' → '}
                                                {role ? (
                                                    <span>{role.name}</span>
                                                ) : (
                                                    <span className='font-mono'>{r.roleId}</span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => void handleRemoveReward(r.level)}
                                                className='text-lucky-text-subtle hover:text-red-400 transition-colors'
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    )
                                })
                            )}
                        </div>

                        <div className='space-y-2 pt-2 border-t border-lucky-border'>
                            <div className='grid grid-cols-2 gap-2'>
                                <div className='space-y-1'>
                                    <Label className='text-xs text-lucky-text-muted'>Level</Label>
                                    <Input
                                        type='number'
                                        min={1}
                                        placeholder='e.g. 5'
                                        value={newRewardLevel}
                                        onChange={e => setNewRewardLevel(e.target.value)}
                                    />
                                </div>
                                <div className='space-y-1'>
                                    <Label className='text-xs text-lucky-text-muted'>Role ID</Label>
                                    <Input
                                        placeholder='Role ID'
                                        value={newRewardRoleId}
                                        onChange={e => setNewRewardRoleId(e.target.value)}
                                    />
                                </div>
                            </div>
                            <Button
                                variant='secondary'
                                onClick={handleAddReward}
                                disabled={addingReward || !newRewardLevel || !newRewardRoleId}
                                className='w-full'
                            >
                                {addingReward ? (
                                    <Loader2 size={14} className='animate-spin' />
                                ) : (
                                    <Plus size={14} />
                                )}
                                Add Reward
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}
