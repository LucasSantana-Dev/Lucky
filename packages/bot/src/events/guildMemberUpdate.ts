import { Events, type GuildMember, type PartialGuildMember } from 'discord.js'
import { roleManagementService } from '@lukbot/shared/services'

export const name = Events.GuildMemberUpdate

export async function execute(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
): Promise<void> {
    await roleManagementService.handleGuildMemberUpdate(oldMember, newMember)
}
