/**
 * How long a queue lingers in voice once it is empty or the channel is.
 * discord-player defaults both cooldowns to 0, so a queue created without
 * these leaves the moment it runs dry, before an autoplay refill lands (#2932).
 */
export const QUEUE_LEAVE_OPTIONS = {
    leaveOnEmpty: true,
    leaveOnEmptyCooldown: 30_000,
    leaveOnEnd: true,
    leaveOnEndCooldown: 300_000,
} as const
