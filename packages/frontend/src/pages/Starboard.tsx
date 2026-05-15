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
import { StarIcon, TrashIcon } from 'lucide-react';

interface StarboardEntry {
  messageId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  starCount: number;
  createdAt: Date;
  channelId: string;
  channelName: string;
}

interface StarboardSettings {
  enabled: boolean;
  requiredStars: number;
  selfStarAllowed: boolean;
  emoji: string;
}

interface StarboardPageProps {
  entries?: StarboardEntry[];
  settings?: StarboardSettings;
  channels?: Array<{ id: string; name: string }>;
  isLoading?: boolean;
  onSettingsChange?: (settings: StarboardSettings) => void;
  onRemoveEntry?: (messageId: string) => void;
}

const SkeletonCard = () => (
  <div className="p-4 rounded-xl bg-lucky-surface-panel border border-lucky-border/50">
    <div className="flex gap-3 mb-3">
      <Skeleton className="w-1 h-20 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
    <Skeleton className="h-16" />
    <Skeleton className="h-3 w-2/3 mt-3" />
  </div>
);

const EntryCard = ({ entry, onRemove }: { entry: StarboardEntry; onRemove: () => void }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="p-4 rounded-xl bg-lucky-surface-panel border border-lucky-border/50 hover:border-lucky-border/80 transition-colors group"
    >
      <div className="flex gap-3">
        <div className="w-1 rounded-full bg-lucky-brand/60 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed text-lucky-text-primary line-clamp-4 mb-3">
            {entry.content}
          </p>
          <div className="flex items-center justify-between pt-2 border-t border-lucky-border/30 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-lucky-accent flex items-center gap-1">
                <StarIcon className="w-3 h-3" />
                {entry.starCount}
              </span>
              <span className="text-lucky-text-muted">{entry.authorName}</span>
              <span className="text-lucky-text-muted">
                {new Date(entry.createdAt).toLocaleDateString()}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <TrashIcon className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const StarboardPage = ({
  entries = [],
  settings = { enabled: false, requiredStars: 1, selfStarAllowed: false, emoji: '⭐' },
  channels = [],
  isLoading = false,
  onSettingsChange,
  onRemoveEntry,
}: StarboardPageProps) => {
  const [activeTab, setActiveTab] = useState<'entries' | 'settings'>('entries');

  const handleSettingChange = useCallback(
    (key: keyof StarboardSettings, value: any) => {
      onSettingsChange?.({ ...settings, [key]: value });
    },
    [settings, onSettingsChange]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-lucky-border/30">
        <Button
          variant={activeTab === 'entries' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('entries')}
          className="rounded-b-none"
        >
          Entries
        </Button>
        <Button
          variant={activeTab === 'settings' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('settings')}
          className="rounded-b-none"
        >
          Settings
        </Button>
      </div>

      {activeTab === 'entries' && (
        <section>
          <h2 className="text-2xl font-bold text-lucky-text-primary mb-4">Top Starred Messages</h2>
          {entries.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              <AnimatePresence mode="popLayout">
                {entries.map((entry) => (
                  <EntryCard
                    key={entry.messageId}
                    entry={entry}
                    onRemove={() => onRemoveEntry?.(entry.messageId)}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <EmptyState
              icon="⭐"
              title="No starred messages yet"
              description="Messages that reach the star threshold will appear here."
            />
          )}
        </section>
      )}

      {activeTab === 'settings' && (
        <section>
          <h2 className="text-2xl font-bold text-lucky-text-primary mb-4">Settings</h2>
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Starboard Enabled</Label>
                <p className="text-xs text-lucky-text-muted mt-0.5">
                  Enable or disable the starboard feature
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(enabled) => handleSettingChange('enabled', enabled)}
              />
            </div>

            <div className="border-t border-lucky-border/30 pt-4">
              <Label htmlFor="threshold">Required Stars</Label>
              <Input
                id="threshold"
                type="number"
                value={settings.requiredStars}
                onChange={(e) =>
                  handleSettingChange('requiredStars', parseInt(e.target.value) || 0)
                }
                min="1"
                className="mt-1.5"
              />
              <p className="text-xs text-lucky-text-muted mt-1">
                Messages need this many stars to be added
              </p>
            </div>

            <div className="border-t border-lucky-border/30 pt-4">
              <Label htmlFor="emoji">Star Emoji</Label>
              <Input
                id="emoji"
                value={settings.emoji}
                onChange={(e) => handleSettingChange('emoji', e.target.value)}
                maxLength={2}
                className="mt-1.5"
              />
              <p className="text-xs text-lucky-text-muted mt-1">
                The emoji used for starring messages
              </p>
            </div>

            <div className="border-t border-lucky-border/30 pt-4 flex items-center justify-between">
              <div>
                <Label>Self-Star Allowed</Label>
                <p className="text-xs text-lucky-text-muted mt-0.5">
                  Allow users to star their own messages
                </p>
              </div>
              <Switch
                checked={settings.selfStarAllowed}
                onCheckedChange={(selfStar) => handleSettingChange('selfStarAllowed', selfStar)}
              />
            </div>

            <div className="border-t border-lucky-border/30 pt-4">
              <Label>Target Channel</Label>
              <div className="mt-1.5 space-y-2">
                <div className="flex items-center gap-2 p-2 rounded bg-lucky-surface-highlight/30 border border-lucky-border/30">
                  <Badge variant="secondary" className="text-xs">
                    Active
                  </Badge>
                  <span className="text-sm text-lucky-text-primary">General</span>
                </div>
              </div>
              <p className="text-xs text-lucky-text-muted mt-2">
                Starred messages are posted to this channel
              </p>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
};

export default StarboardPage;
