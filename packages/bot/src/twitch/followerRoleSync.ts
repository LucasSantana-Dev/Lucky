import type { Client } from 'discord.js'
import { errorLog, infoLog, debugLog, warnLog } from '@lucky/shared/utils'
import {
    twitchFollowerRoleService,
    twitchSubscriberRoleService,
} from '@lucky/shared/services'
import { getTwitchEnv } from './token'

// #2160 follow-up: an HTTP failure here used to warnLog per link, which
// bursts once per user on an outage. checkTwitchFollow now only debugLogs
// per link; the caller aggregates failures into one warnLog per sync run.
async function checkTwitchFollow(
    twitchUserId: string,
    broadcasterId: string,
    accessToken: string,
    clientId: string,
): Promise<{ isFollower: boolean; httpErrorStatus?: number }> {
    try {
        const url = new URL('https://api.twitch.tv/helix/channels/followers')
        url.searchParams.set('broadcaster_id', broadcasterId)
        url.searchParams.set('user_id', twitchUserId)
        const res = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Client-Id': clientId,
            },
            signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
            debugLog({
                message: `Twitch follow check failed ${res.status} for user ${twitchUserId}`,
            })
            return { isFollower: false, httpErrorStatus: res.status }
        }
        const data = (await res.json()) as { total?: number }
        return { isFollower: (data.total ?? 0) > 0 }
    } catch {
        return { isFollower: false }
    }
}

export async function syncGuildFollowerRoles(
    guildId: string,
    client: Client,
): Promise<{ updated: number; errors: number }> {
    const [config, subscriberConfig] = await Promise.all([
        twitchFollowerRoleService.getConfig(guildId),
        twitchSubscriberRoleService.getConfig(guildId),
    ])
    if (!config && !subscriberConfig) return { updated: 0, errors: 0 }

    const { clientId, accessToken } = getTwitchEnv()
    const twitchReady = Boolean(clientId && accessToken)
    if (config && !twitchReady) return { updated: 0, errors: 0 }

    const links = await twitchFollowerRoleService.getLinksForGuild(guildId)
    if (links.length === 0) return { updated: 0, errors: 0 }

    let updated = 0
    let errors = 0
    let followCheckFailures = 0
    let firstFollowCheckFailureStatus: number | undefined

    const guild = client.guilds.cache.get(guildId)
    if (!guild) return { updated: 0, errors: 0 }

    for (const link of links) {
        try {
            if (config && twitchReady) {
                const followResult = await checkTwitchFollow(
                    link.twitchUserId,
                    config.twitchBroadcasterId,
                    accessToken!,
                    clientId!,
                )
                const isFollower = followResult.isFollower
                if (followResult.httpErrorStatus !== undefined) {
                    followCheckFailures++
                    firstFollowCheckFailureStatus ??=
                        followResult.httpErrorStatus
                }

                await twitchFollowerRoleService.updateFollowerStatus(
                    link.discordUserId,
                    guildId,
                    isFollower,
                )

                const member = await guild.members
                    .fetch(link.discordUserId)
                    .catch(() => null)
                if (!member) continue

                const role = guild.roles.cache.get(config.discordRoleId)
                if (!role) continue

                const hasRole = member.roles.cache.has(config.discordRoleId)

                if (isFollower && !hasRole) {
                    await member.roles.add(role)
                    updated++
                    debugLog({
                        message: `Added follower role to ${link.discordUserId} in ${guildId}`,
                    })
                } else if (!isFollower && hasRole) {
                    await member.roles.remove(role)
                    updated++
                    debugLog({
                        message: `Removed follower role from ${link.discordUserId} in ${guildId}`,
                    })
                }
            }

            // Subscriber role (from stored status — checked at auth time, no Twitch API call)
            if (subscriberConfig) {
                const member = await guild.members
                    .fetch(link.discordUserId)
                    .catch(() => null)
                if (member) {
                    const subRole = guild.roles.cache.get(
                        subscriberConfig.discordRoleId,
                    )
                    if (subRole) {
                        const hasSubRole = member.roles.cache.has(
                            subscriberConfig.discordRoleId,
                        )
                        if (link.isSubscriber && !hasSubRole) {
                            await member.roles.add(subRole)
                            updated++
                            debugLog({
                                message: `Added subscriber role to ${link.discordUserId} in ${guildId}`,
                            })
                        } else if (!link.isSubscriber && hasSubRole) {
                            await member.roles.remove(subRole)
                            updated++
                            debugLog({
                                message: `Removed subscriber role from ${link.discordUserId} in ${guildId}`,
                            })
                        }
                    }
                }
            }
        } catch (error) {
            errors++
            errorLog({
                message: `followerRoleSync: error processing ${link.discordUserId}`,
                error,
            })
        }
    }

    if (followCheckFailures > 0) {
        warnLog({
            message: `Twitch follow check failed for ${followCheckFailures} user(s) in guild ${guildId}`,
            data: {
                guildId,
                count: followCheckFailures,
                firstStatus: firstFollowCheckFailureStatus,
            },
        })
    }

    return { updated, errors }
}

export async function syncAllGuildFollowerRoles(client: Client): Promise<void> {
    const configs = await twitchFollowerRoleService.getAllConfigs()
    if (configs.length === 0) return

    infoLog({ message: `followerRoleSync: syncing ${configs.length} guild(s)` })
    for (const config of configs) {
        const result = await syncGuildFollowerRoles(config.guildId, client)
        debugLog({
            message: `followerRoleSync: guild=${config.guildId} updated=${result.updated} errors=${result.errors}`,
        })
    }
}

export async function assignFollowerRole(
    discordUserId: string,
    guildId: string,
    client: Client,
): Promise<boolean> {
    const config = await twitchFollowerRoleService.getConfig(guildId)
    if (!config) return false

    try {
        const guild = client.guilds.cache.get(guildId)
        if (!guild) return false

        const member = await guild.members
            .fetch(discordUserId)
            .catch(() => null)
        if (!member) return false

        const role = guild.roles.cache.get(config.discordRoleId)
        if (!role) return false

        if (!member.roles.cache.has(config.discordRoleId)) {
            await member.roles.add(role)
        }
        return true
    } catch (error) {
        errorLog({
            message: `assignFollowerRole: failed for ${discordUserId}`,
            error,
        })
        return false
    }
}
