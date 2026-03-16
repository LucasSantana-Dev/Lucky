import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits, ChannelType } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { successEmbed, errorEmbed, infoEmbed } from '../../../utils/general/embeds'
import { errorLog } from '@lucky/shared/utils'
import { levelService, xpNeededForLevel } from '@lucky/shared/services'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('XP and level system')
        .addSubcommand((sub) =>
            sub
                .setName('rank')
                .setDescription('Show your rank or another user\'s rank')
                .addUserOption((o) =>
                    o.setName('user').setDescription('User to check').setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('leaderboard').setDescription('Show the XP leaderboard'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('setup')
                .setDescription('Configure the level system')
                .addIntegerOption((o) =>
                    o
                        .setName('xp-per-message')
                        .setDescription('XP awarded per message (default: 15)')
                        .setMinValue(1)
                        .setRequired(true),
                )
                .addIntegerOption((o) =>
                    o
                        .setName('cooldown-seconds')
                        .setDescription('Cooldown between XP awards in seconds (default: 60)')
                        .setMinValue(1)
                        .setRequired(true),
                )
                .addChannelOption((o) =>
                    o
                        .setName('announce-channel')
                        .setDescription('Channel to announce level-ups')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('reward')
                .setDescription('Manage level rewards')
                .addSubcommand((sub) =>
                    sub
                        .setName('add')
                        .setDescription('Add a role reward for reaching a level')
                        .addIntegerOption((o) =>
                            o.setName('level').setDescription('Level required').setMinValue(1).setRequired(true),
                        )
                        .addRoleOption((o) =>
                            o.setName('role').setDescription('Role to grant').setRequired(true),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a role reward for a level')
                        .addIntegerOption((o) =>
                            o.setName('level').setDescription('Level to remove reward from').setMinValue(1).setRequired(true),
                        ),
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'general',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return
        if (!interaction.guild) return

        const subcommandGroup = interaction.options.getSubcommandGroup(false)
        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommandGroup === 'reward') {
                if (subcommand === 'add') {
                    const level = interaction.options.getInteger('level', true)
                    const role = interaction.options.getRole('role', true)
                    await levelService.addReward(interaction.guild.id, level, role.id)
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                successEmbed(
                                    'Reward Added',
                                    `${role} will be granted when reaching level **${level}**.`,
                                ),
                            ],
                        },
                    })
                } else if (subcommand === 'remove') {
                    const level = interaction.options.getInteger('level', true)
                    await levelService.removeReward(interaction.guild.id, level)
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [successEmbed('Reward Removed', `Reward for level **${level}** removed.`)],
                        },
                    })
                }
                return
            }

            if (subcommand === 'rank') {
                const targetUser = interaction.options.getUser('user') ?? interaction.user
                const guildId = interaction.guild.id
                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null)
                const xpData = await levelService.getMemberXP(guildId, targetUser.id)
                const rank = await levelService.getRank(guildId, targetUser.id)

                const xp = xpData?.xp ?? 0
                const level = xpData?.level ?? 0
                const xpNeeded = xpNeededForLevel(level + 1)

                const description = [
                    `**User:** ${member ?? targetUser.username}`,
                    `**Level:** ${level}`,
                    `**XP:** ${xp} / ${xpNeeded}`,
                    `**Rank:** #${rank}`,
                ].join('\n')

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [infoEmbed('Rank', description)],
                    },
                })
            } else if (subcommand === 'leaderboard') {
                const entries = await levelService.getLeaderboard(interaction.guild.id, 10)

                if (entries.length === 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [infoEmbed('Leaderboard', 'No XP recorded yet.')],
                        },
                    })
                    return
                }

                const lines = entries.map(
                    (e: { userId: string; level: number; xp: number }, i: number) => `**${i + 1}.** <@${e.userId}> — Level ${e.level} (${e.xp} XP)`,
                )

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [infoEmbed('XP Leaderboard', lines.join('\n'))],
                    },
                })
            } else if (subcommand === 'setup') {
                const xpPerMessage = interaction.options.getInteger('xp-per-message', true)
                const cooldownSeconds = interaction.options.getInteger('cooldown-seconds', true)
                const announceChannel = interaction.options.getChannel('announce-channel')

                await levelService.upsertConfig(interaction.guild.id, {
                    xpPerMessage,
                    xpCooldownMs: cooldownSeconds * 1000,
                    announceChannel: announceChannel?.id ?? null,
                })

                const lines = [
                    `**XP per message:** ${xpPerMessage}`,
                    `**Cooldown:** ${cooldownSeconds}s`,
                    announceChannel ? `**Announce channel:** ${announceChannel}` : '**Announce channel:** None',
                ]

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [successEmbed('Level System Configured', lines.join('\n'))],
                    },
                })
            }
        } catch (error) {
            errorLog({ message: 'Error in level command:', error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        errorEmbed(
                            'Error',
                            error instanceof Error ? error.message : 'An error occurred.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
