import { REST, Routes } from 'discord.js'
import { config } from '@lucky/shared/config'
import { errorLog, infoLog } from '@lucky/shared/utils'

export type GuildRef = { id: string; name: string }

export type ClearResult = {
    cleared: string[]
    failed: { id: string; name: string }[]
}

/**
 * One-off migration for #1886.
 *
 * Lucky used to register slash commands per guild. Those guild-scoped copies
 * live on Discord's side until explicitly deleted, and they shadow the global
 * set with whatever definitions the last redeploy wrote, so they have to go.
 *
 * This is deliberately NOT part of the ready handler. Sequencing the REST calls
 * does not sequence Discord's propagation: a new global command set is
 * documented as taking up to an hour to become visible, so clearing a guild's
 * instant guild-scoped commands at boot could leave a live server with nothing
 * at all in the meantime. Run this once, after confirming the global commands
 * are actually visible in a server.
 *
 * A single guild failing (bot kicked mid-run, transient 5xx) must not abort the
 * rest, or the guilds after it silently keep their stale commands.
 */
export async function clearGuildCommands(
    guilds: GuildRef[],
    deps: { rest: Pick<REST, 'put'>; clientId: string },
): Promise<ClearResult> {
    const result: ClearResult = { cleared: [], failed: [] }

    for (const guild of guilds) {
        try {
            await deps.rest.put(
                Routes.applicationGuildCommands(deps.clientId, guild.id),
                { body: [] },
            )
            result.cleared.push(guild.name)
            infoLog({
                message: `Cleared guild-scoped commands: ${guild.name}`,
            })
        } catch (error) {
            result.failed.push({ id: guild.id, name: guild.name })
            errorLog({
                message: `Failed to clear guild-scoped commands: ${guild.name}`,
                error,
            })
        }
    }

    return result
}

/** Discord's page size for GET /users/@me/guilds. */
const GUILD_PAGE_SIZE = 200

/**
 * `/users/@me/guilds` is paginated and returns at most 200 entries. Taking only
 * the first page would silently skip every guild after that, leaving them
 * shadowing the global commands with no error — the exact failure this script
 * exists to prevent. Lucky is well under 200 today, but growing past it is the
 * point of being listed, and a migration that quietly half-runs is worse than
 * one that fails.
 */
export async function fetchAllGuilds(
    rest: Pick<REST, 'get'>,
): Promise<GuildRef[]> {
    const all: GuildRef[] = []
    let after: string | undefined

    for (;;) {
        const query = new URLSearchParams({ limit: String(GUILD_PAGE_SIZE) })
        if (after) query.set('after', after)

        const page = (await rest.get(Routes.userGuilds(), {
            query,
        })) as GuildRef[]

        all.push(...page)
        if (page.length < GUILD_PAGE_SIZE) return all
        after = page[page.length - 1].id
    }
}

/**
 * Logs in only far enough to read the guild list, clears each guild's commands,
 * then exits non-zero if any guild was missed so the operator re-runs it.
 */
export async function runClearGuildCommands(): Promise<ClearResult> {
    const { TOKEN, CLIENT_ID } = config()
    if (!TOKEN || !CLIENT_ID) {
        throw new Error('DISCORD_TOKEN or CLIENT_ID not configured')
    }

    const rest = new REST({ version: '10' }).setToken(TOKEN)
    const guilds = await fetchAllGuilds(rest)

    infoLog({
        message: `Clearing guild-scoped commands for ${guilds.length} guild(s)`,
    })

    const result = await clearGuildCommands(guilds, {
        rest,
        clientId: CLIENT_ID,
    })

    infoLog({
        message: `Cleared ${result.cleared.length}, failed ${result.failed.length}`,
    })

    return result
}
