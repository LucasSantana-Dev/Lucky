import { Events, type GuildMember, type PartialGuildMember } from 'discord.js'
import { roleManagementService } from '../services/RoleManagementService'

export const name = Events.GuildMemberUpdate

export async function execute(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
): Promise<void> {
    await roleManagementService.handleGuildMemberUpdate(oldMember, newMember)
}
