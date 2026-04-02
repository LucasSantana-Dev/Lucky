import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    type Guild,
    type CategoryChannel,
    type TextChannel,
    type Role,
    type OverwriteResolvable,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'
import {
    formatCriativariaSummary,
    resolveSetupMode,
    runCriativariaSetup,
} from './helpers/serversetupCriativaria.js'

interface ChannelDef {
    name: string
    topic?: string
    readonly?: boolean
}

interface CategoryDef {
    name: string
    channels: ChannelDef[]
}

interface RoleDef {
    name: string
    color: number
    hoist: boolean
    mentionable: boolean
}

const FORGE_ROLES: RoleDef[] = [
    {
        name: 'Maintainer',
        color: 0x8b5cf6,
        hoist: true,
        mentionable: true,
    },
    {
        name: 'Contributor',
        color: 0x22c55e,
        hoist: true,
        mentionable: true,
    },
    {
        name: 'Community',
        color: 0x6b7280,
        hoist: false,
        mentionable: false,
    },
]

const FORGE_CATEGORIES: CategoryDef[] = [
    {
        name: '📢 INFO',
        channels: [
            {
                name: 'announcements',
                topic: 'Official Forge Space announcements and releases',
                readonly: true,
            },
            {
                name: 'rules',
                topic: 'Community guidelines and code of conduct',
                readonly: true,
            },
            {
                name: 'roadmap',
                topic: 'What we are building and where we are heading',
                readonly: true,
            },
        ],
    },
    {
        name: '💬 COMMUNITY',
        channels: [
            {
                name: 'general',
                topic: 'General discussion about Forge Space IDP',
            },
            {
                name: 'introductions',
                topic: 'Introduce yourself to the community',
            },
            {
                name: 'showcase',
                topic: 'Show what you built with Forge Space',
            },
        ],
    },
    {
        name: '🛠️ SUPPORT',
        channels: [
            {
                name: 'getting-started',
                topic: 'Help with setup, installation, first steps',
            },
            {
                name: 'siza-help',
                topic: 'Questions about the Siza platform',
            },
            {
                name: 'mcp-gateway-help',
                topic: 'Questions about MCP Gateway routing',
            },
            {
                name: 'troubleshooting',
                topic: 'Debug issues and share solutions',
            },
        ],
    },
    {
        name: '🏗️ DEVELOPMENT',
        channels: [
            {
                name: 'contributing',
                topic: 'How to contribute, good first issues, PRs',
            },
            {
                name: 'architecture',
                topic: 'Design discussions and RFCs',
            },
            {
                name: 'releases',
                topic: 'Release notes and changelogs',
                readonly: true,
            },
        ],
    },
    {
        name: '🎵 CHILL',
        channels: [
            {
                name: 'off-topic',
                topic: 'Anything goes (within rules)',
            },
            {
                name: 'music-bot',
                topic: 'Lucky music commands go here',
            },
        ],
    },
]

const WELCOME_EMBED = new EmbedBuilder()
    .setTitle('Welcome to Forge Space')
    .setDescription(
        [
            'The open-source **Internal Developer Platform** that prevents',
            '"AI limbo engineering" — where teams generate code faster',
            'than they can govern it.',
            '',
            '**Quick Links**',
            '• [Documentation](https://siza.forgespace.co/docs)',
            '• [GitHub](https://github.com/Forge-Space)',
            '• [Website](https://forgespace.co)',
            '',
            '**Get Started**',
            '1. Read the <#rules> channel',
            '2. Introduce yourself in <#introductions>',
            '3. Check <#getting-started> for setup guides',
            '4. Browse <#good-first-issues> to contribute',
        ].join('\n'),
    )
    .setColor(0x8b5cf6)
    .setFooter({
        text: 'Forge Space — Ship with confidence',
    })

async function createRoles(guild: Guild): Promise<Map<string, Role>> {
    const created = new Map<string, Role>()
    for (const def of FORGE_ROLES) {
        const existing = guild.roles.cache.find((r) => r.name === def.name)
        if (existing) {
            created.set(def.name, existing)
            continue
        }
        const role = await guild.roles.create({
            name: def.name,
            color: def.color,
            hoist: def.hoist,
            mentionable: def.mentionable,
            reason: 'Forge Space server setup',
        })
        created.set(def.name, role)
    }
    return created
}

async function createCategory(
    guild: Guild,
    def: CategoryDef,
): Promise<{ category: CategoryChannel; channels: TextChannel[] }> {
    const existing = guild.channels.cache.find(
        (c) => c.name === def.name && c.type === ChannelType.GuildCategory,
    ) as CategoryChannel | undefined

    const category =
        existing ??
        ((await guild.channels.create({
            name: def.name,
            type: ChannelType.GuildCategory,
            reason: 'Forge Space server setup',
        })) as CategoryChannel)

    const channels: TextChannel[] = []
    for (const chDef of def.channels) {
        const existingCh = guild.channels.cache.find(
            (c) =>
                c.name === chDef.name &&
                c.type === ChannelType.GuildText &&
                c.parentId === category.id,
        ) as TextChannel | undefined

        if (existingCh) {
            channels.push(existingCh)
            continue
        }

        const overwrites: OverwriteResolvable[] = []
        if (chDef.readonly) {
            overwrites.push({
                id: guild.roles.everyone.id,
                deny: ['SendMessages'],
                allow: ['ViewChannel'],
            })
        }

        const ch = (await guild.channels.create({
            name: chDef.name,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: chDef.topic,
            permissionOverwrites: overwrites,
            reason: 'Forge Space server setup',
        })) as TextChannel
        channels.push(ch)
    }

    return { category, channels }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('serversetup')
        .setDescription('Set up a preconfigured server template')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option
                .setName('template')
                .setDescription('Server template to apply')
                .setRequired(true)
                .addChoices({
                    name: 'forge-space',
                    value: 'forge-space',
                }, {
                    name: 'criativaria',
                    value: 'criativaria',
                }),
        )
        .addStringOption((option) =>
            option
                .setName('mode')
                .setDescription('Execution mode')
                .setRequired(false)
                .addChoices({
                    name: 'apply',
                    value: 'apply',
                }, {
                    name: 'dry-run',
                    value: 'dry-run',
                }),
        ),
    category: 'management',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        const template = interaction.options.getString('template', true)
        const mode = resolveSetupMode(interaction.options.getString('mode'))

        if (template === 'criativaria') {
            await interaction.deferReply({ ephemeral: true })
            try {
                const result = await runCriativariaSetup(interaction.guild, mode)
                await interaction.editReply(formatCriativariaSummary(result, mode))
                infoLog({
                    message: `serversetup: Criativaria template executed in ${mode} mode for ${interaction.guild.name}`,
                })
            } catch (error) {
                errorLog({
                    message: 'serversetup: Failed to execute Criativaria template',
                    error,
                })
                await interaction.editReply(
                    '❌ Failed to run Criativaria setup. Check logs and try again.',
                )
            }
            return
        }

        if (template !== 'forge-space') {
            await interactionReply({
                interaction,
                content: {
                    content: `❌ Unknown template: ${template}`,
                },
            })
            return
        }

        if (mode === 'dry-run') {
            await interactionReply({
                interaction,
                content: {
                    content:
                        '🧪 **Forge Space dry-run**\n- Planejado: criar cargos base\n- Planejado: criar categorias/canais padrão\n- Planejado: enviar embed de boas-vindas',
                    ephemeral: true,
                },
            })
            return
        }

        await interaction.deferReply({ ephemeral: true })

        const guild = interaction.guild
        const progress: string[] = []

        try {
            progress.push('Creating roles...')
            await interaction.editReply(progress.join('\n'))
            const roles = await createRoles(guild)
            progress.push(
                `✅ ${roles.size} roles ready (${[...roles.keys()].join(', ')})`,
            )

            progress.push('Creating channels...')
            await interaction.editReply(progress.join('\n'))

            let totalChannels = 0
            let welcomeChannel: TextChannel | null = null

            for (const catDef of FORGE_CATEGORIES) {
                const { channels } = await createCategory(guild, catDef)
                totalChannels += channels.length

                const general = channels.find((c) => c.name === 'general')
                if (general) welcomeChannel = general
            }

            progress.push(
                `✅ ${FORGE_CATEGORIES.length} categories, ${totalChannels} channels created`,
            )

            if (welcomeChannel) {
                progress.push('Sending welcome message...')
                await interaction.editReply(progress.join('\n'))
                await welcomeChannel.send({ embeds: [WELCOME_EMBED] })
                progress.push('✅ Welcome embed sent to #general')
            }

            progress.push('')
            progress.push('🎉 **Forge Space server setup complete!**')
            progress.push('')
            progress.push('**Next steps:**')
            progress.push(
                '• Keep your current server icon/splash/banner (Lucky preserves guild identity)',
            )
            progress.push('• Configure community features in Server Settings')
            progress.push('• Set up verification level')
            progress.push('• Post first announcement in #announcements')

            await interaction.editReply(progress.join('\n'))
            infoLog({
                message: `serversetup: Forge Space template applied to ${guild.name}`,
            })
        } catch (err) {
            errorLog({
                message: 'serversetup: Failed to setup server',
                error: err,
            })
            progress.push(
                `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
            )
            await interaction.editReply(progress.join('\n'))
        }
    },
})
