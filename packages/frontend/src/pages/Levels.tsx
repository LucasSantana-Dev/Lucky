import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PlusIcon, TrashIcon, GripVerticalIcon } from 'lucide-react';

interface UserLevel {
  userId: string;
  username: string;
  currentXp: number;
  nextLevelXp: number;
  level: number;
  avatarUrl?: string;
  roles: Array<{ id: string; name: string; color?: string }>;
}

interface LevelReward {
  levelThreshold: number;
  roleId?: string;
  roleName?: string;
}

interface LevelsPageProps {
  leaderboard: UserLevel[];
  rewards: LevelReward[];
  settings: {
    enabled: boolean;
    announcement: string;
    minMessageLength: number;
    cooldown: number;
  };
  isLoading?: boolean;
  onSettingsChange?: (settings: any) => void;
  onRewardsChange?: (rewards: LevelReward[]) => void;
}

const XpBar = ({ current, next }: { current: number; next: number }) => {
  const percentage = Math.min((current / next) * 100, 100);
  return (
    <div className="w-full bg-lucky-surface-highlight rounded-full h-1.5 overflow-hidden">
      <motion.div
        className="h-full bg-lucky-brand"
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
};

const LeaderboardRowPrimary = ({ user, rank }: { user: UserLevel; rank: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="p-6 rounded-xl bg-gradient-to-br from-lucky-surface-panel to-lucky-surface-elevated border border-lucky-border/50"
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-16 h-16 rounded-lg border border-lucky-border"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-lucky-surface-highlight border border-lucky-border flex items-center justify-center text-2xl font-bold text-lucky-brand">
              {user.username[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-3xl font-bold text-lucky-brand">#{rank}</h3>
            <p className="text-xl font-semibold text-lucky-text-primary">{user.username}</p>
          </div>
          <div className="flex items-center gap-2 mb-3">
            {user.roles.slice(0, 2).map((role) => (
              <Badge key={role.id} variant="outline" className="text-xs">
                {role.name}
              </Badge>
            ))}
          </div>
          <div className="mb-3">
            <Badge variant="secondary" className="bg-lucky-brand/20 text-lucky-brand font-bold">
              Level {user.level}
            </Badge>
          </div>
          <XpBar current={user.currentXp} next={user.nextLevelXp} />
          <div className="flex items-center justify-between mt-2 text-xs text-lucky-text-muted">
            <span>{user.currentXp.toLocaleString()} XP</span>
            <span>{(user.nextLevelXp - user.currentXp).toLocaleString()} to level up</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const LeaderboardRowCompact = ({ user, rank }: { user: UserLevel; rank: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * (rank - 1) }}
      className="p-3 flex items-center gap-3 border-b border-lucky-border/30 hover:bg-lucky-surface-highlight/40 transition-colors"
    >
      <span className="w-6 text-center font-mono text-sm font-semibold text-lucky-accent">
        {rank}
      </span>
      <img
        src={user.avatarUrl || ''}
        alt={user.username}
        className="w-8 h-8 rounded border border-lucky-border flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-lucky-text-primary truncate">{user.username}</p>
        <p className="text-xs text-lucky-text-muted">
          Level {user.level} · {user.currentXp.toLocaleString()} XP
        </p>
      </div>
      <Badge variant="outline" className="text-xs flex-shrink-0">
        Lv {user.level}
      </Badge>
    </motion.div>
  );
};

export const LevelsPage = ({
  leaderboard,
  rewards,
  settings,
  isLoading = false,
  onSettingsChange,
  onRewardsChange,
}: LevelsPageProps) => {
  const [expandedReward, setExpandedReward] = useState<number | null>(null);
  const [newReward, setNewReward] = useState({ level: '', roleId: '' });

  const handleAddReward = useCallback(() => {
    if (newReward.level && newReward.roleId) {
      onRewardsChange?.([
        ...rewards,
        { levelThreshold: parseInt(newReward.level), roleId: newReward.roleId },
      ]);
      setNewReward({ level: '', roleId: '' });
    }
  }, [newReward, rewards, onRewardsChange]);

  const handleRemoveReward = useCallback(
    (index: number) => {
      onRewardsChange?.(rewards.filter((_, i) => i !== index));
    },
    [rewards, onRewardsChange]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  const topUser = leaderboard[0];
  const restLeaderboard = leaderboard.slice(1, 11);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-lucky-text-primary mb-4">Leaderboard</h2>

        {topUser ? (
          <div className="mb-6">
            <LeaderboardRowPrimary user={topUser} rank={1} />
          </div>
        ) : (
          <EmptyState
            icon="🏆"
            title="No users yet"
            description="Users will appear here as they gain XP."
          />
        )}

        {restLeaderboard.length > 0 && (
          <Card className="overflow-hidden">
            <div className="divide-y divide-lucky-border/30">
              {restLeaderboard.map((user, idx) => (
                <LeaderboardRowCompact key={user.userId} user={user} rank={idx + 2} />
              ))}
            </div>
          </Card>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-lucky-text-primary mb-4">Settings</h3>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Levels Enabled</Label>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(enabled) =>
                  onSettingsChange?.({ ...settings, enabled })
                }
              />
            </div>
            <div>
              <Label htmlFor="announcement">Announcement Channel</Label>
              <Input
                id="announcement"
                value={settings.announcement}
                onChange={(e) =>
                  onSettingsChange?.({ ...settings, announcement: e.target.value })
                }
                placeholder="Select channel"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="minLength">Min. Message Length</Label>
              <Input
                id="minLength"
                type="number"
                value={settings.minMessageLength}
                onChange={(e) =>
                  onSettingsChange?.({
                    ...settings,
                    minMessageLength: parseInt(e.target.value),
                  })
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cooldown">XP Cooldown (sec)</Label>
              <Input
                id="cooldown"
                type="number"
                value={settings.cooldown}
                onChange={(e) =>
                  onSettingsChange?.({ ...settings, cooldown: parseInt(e.target.value) })
                }
                className="mt-1.5"
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-lucky-text-primary mb-4">Rewards</h3>
          <AnimatePresence mode="popLayout">
            {rewards.map((reward, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center justify-between p-2 rounded bg-lucky-surface-highlight/30 mb-2"
              >
                <div className="flex items-center gap-2">
                  <GripVerticalIcon className="w-4 h-4 text-lucky-text-muted" />
                  <span className="text-sm">Level {reward.levelThreshold}</span>
                  <Badge variant="outline" className="text-xs">
                    {reward.roleName || 'Unknown'}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveReward(idx)}
                  className="h-7 w-7 p-0"
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="space-y-1.5 pt-2 border-t border-lucky-border/30 mt-3">
            <div>
              <Label htmlFor="newLevel" className="text-xs">
                Level
              </Label>
              <Input
                id="newLevel"
                type="number"
                placeholder="5"
                value={newReward.level}
                onChange={(e) => setNewReward({ ...newReward, level: e.target.value })}
                className="mt-0.5 h-8"
              />
            </div>
            <div>
              <Label htmlFor="newRole" className="text-xs">
                Role ID
              </Label>
              <Input
                id="newRole"
                placeholder="Role ID"
                value={newReward.roleId}
                onChange={(e) => setNewReward({ ...newReward, roleId: e.target.value })}
                className="mt-0.5 h-8"
              />
            </div>
            <Button
              onClick={handleAddReward}
              className="w-full h-8 text-xs gap-1"
              disabled={!newReward.level || !newReward.roleId}
            >
              <PlusIcon className="w-3 h-3" />
              Add Reward
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
};

export default LevelsPage;
