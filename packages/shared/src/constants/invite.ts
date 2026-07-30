import { TOP_GG_BOT_ID } from './topgg'

/**
 * The curated invite permission set, per
 * `decisions/2026-06-18-invite-permission-scope.md`:
 *
 *   music        View Channels, Send Messages, Embed Links, Connect, Speak
 *   cleanup      Manage Messages  — auto-mod deletes offending messages
 *   attribution  View Audit Log   — read-only; `auditHandler` attributes mod cases
 *
 * **Never Administrator.** The bot genuinely does not need it: `Administrator`
 * appears in this codebase only as `setDefaultMemberPermissions`, which gates
 * *who may invoke a command*, not what the bot itself can do.
 *
 * The high-alarm permissions (Ban/Kick/ManageRoles/ManageChannels/ManageGuild/
 * ModerateMembers) are deliberately **not** in the invite. They are escalated
 * on demand, and commands needing them check `interaction.appPermissions` and
 * prompt rather than throwing a raw `50013` (#1498).
 *
 * This lives in shared because five copies had drifted apart (#1888, #1894,
 * #1923). The docs page shipped `8` (Administrator); so did the dashboard's
 * "add Lucky to this server" flow in `GuildService.generateBotInviteUrl`. The
 * backend redirect shipped `36970496` — Manage Messages, Use External Emojis,
 * Connect, Speak, Use Voice Activity — with no View Channels and no Send
 * Messages, so a bot invited with it could not read or post. The landing page
 * shipped the music-only subset. None of them matched the ADR.
 */
export const BOT_INVITE_PERMISSIONS = '3173504'

/** The Discord application id. Public: it appears in every OAuth invite URL. */
export const BOT_CLIENT_ID = TOP_GG_BOT_ID

/**
 * The canonical Discord OAuth invite URL.
 *
 * @param clientId - Override for forks running their own application.
 */
export function buildBotInviteUrl(clientId: string = BOT_CLIENT_ID): string {
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${BOT_INVITE_PERMISSIONS}`
}
