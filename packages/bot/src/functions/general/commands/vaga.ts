import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ChannelType,
    type ChatInputCommandInteraction,
    type GuildBasedChannel,
} from 'discord.js'
import Command from '../../../models/Command'
import { infoLog, errorLog, getPrismaClient } from '@lucky/shared/utils'
import { detectVagaRoleTags } from '../../../utils/general/vagaTagger'

const MODALIDADE = {
    remoto: { label: 'Remoto', display: '🏠 Remoto' },
    presencial: { label: 'Presencial', display: '🏢 Presencial' },
    hibrido: { label: 'Híbrido', display: '🔀 Híbrido' },
} as const

const SENIORIDADE: Record<string, string> = {
    estagio: 'Estágio',
    junior: 'Junior',
    pleno: 'Pleno',
    senior: 'Senior',
}

const VAGAS_LABEL = 'Vagas'

function buildVagaMessage(
    titulo: string,
    descricao: string,
    url: string,
    modalidadeDisplay: string | null,
): string {
    const parts = [`📍 **${titulo}**`]
    if (modalidadeDisplay) parts.push(modalidadeDisplay)
    parts.push(`✅ **REQUISITOS:**\n${descricao}`)
    parts.push(`➡️ ${url}`)
    return parts.join('\n\n')
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('vaga')
        .setDescription(
            '📋 Monta e publica uma vaga em #vagas com os cargos marcados',
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((o) =>
            o
                .setName('titulo')
                .setDescription('Título da vaga')
                .setRequired(true),
        )
        .addStringOption((o) =>
            o
                .setName('descricao')
                .setDescription('Descrição / requisitos da vaga')
                .setRequired(true),
        )
        .addStringOption((o) =>
            o
                .setName('url')
                .setDescription('Link para candidatura')
                .setRequired(true),
        )
        .addStringOption((o) =>
            o
                .setName('modalidade')
                .setDescription('Modalidade de trabalho')
                .addChoices(
                    { name: 'Remoto', value: 'remoto' },
                    { name: 'Presencial', value: 'presencial' },
                    { name: 'Híbrido', value: 'hibrido' },
                ),
        )
        .addStringOption((o) =>
            o
                .setName('senioridade')
                .setDescription('Senioridade')
                .addChoices(
                    { name: 'Estágio', value: 'estagio' },
                    { name: 'Junior', value: 'junior' },
                    { name: 'Pleno', value: 'pleno' },
                    { name: 'Senior', value: 'senior' },
                ),
        ),
    category: 'general',
    execute: async ({ interaction }) => {
        const chat = interaction as ChatInputCommandInteraction
        if (!chat.guild) {
            await chat.reply({
                content: 'Este comando só funciona em um servidor.',
                ephemeral: true,
            })
            return
        }

        const titulo = chat.options.getString('titulo', true)
        const descricao = chat.options.getString('descricao', true)
        const url = chat.options.getString('url', true)
        const modalidadeVal = chat.options.getString('modalidade')
        const senioridadeVal = chat.options.getString('senioridade')

        const modalidade = modalidadeVal
            ? MODALIDADE[modalidadeVal as keyof typeof MODALIDADE]
            : null

        const prisma = getPrismaClient()
        const messages = await prisma.reactionRoleMessage.findMany({
            where: { guildId: chat.guild.id },
            include: { mappings: true },
        })
        const mappings = messages.flatMap((msg) =>
            msg.mappings
                .filter((m) => m.label)
                .map((m) => ({ label: m.label as string, roleId: m.roleId })),
        )
        const vagasRoleId = mappings.find(
            (m) => m.label === VAGAS_LABEL,
        )?.roleId

        const forcedLabels: string[] = []
        if (modalidade) forcedLabels.push(modalidade.label)
        if (senioridadeVal && SENIORIDADE[senioridadeVal]) {
            forcedLabels.push(SENIORIDADE[senioridadeVal])
        }

        const tags = detectVagaRoleTags(`${titulo}\n${descricao}`, mappings, {
            vagasRoleId,
            forcedLabels,
        })
        const roleIds = tags.map((t) => t.roleId)
        const pings = roleIds.map((id) => `<@&${id}>`).join(' ')

        const body = buildVagaMessage(
            titulo,
            descricao,
            url,
            modalidade?.display ?? null,
        )
        const preview = `${body}\n\n${pings}`

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('vaga_publish')
                .setLabel('Publicar em #vagas')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('vaga_cancel')
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Secondary),
        )

        const tagList = tags.map((t) => t.label).join(', ') || '(nenhum)'
        const message = await chat.reply({
            content: `**Prévia da vaga** (cargos marcados: ${tagList})\n\n${preview}`,
            components: [row],
            ephemeral: true,
            fetchReply: true,
        })

        let choice
        try {
            choice = await message.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: (i) => i.user.id === chat.user.id,
                time: 5 * 60 * 1000,
            })
        } catch {
            await chat.editReply({
                content: '⏱️ Tempo esgotado — vaga não publicada.',
                components: [],
            })
            return
        }

        if (choice.customId === 'vaga_cancel') {
            await choice.update({ content: '❌ Cancelado.', components: [] })
            return
        }

        const channel = chat.guild.channels.cache.find(
            (c: GuildBasedChannel) =>
                /vagas/i.test(c.name) &&
                (c.type === ChannelType.GuildText ||
                    c.type === ChannelType.GuildAnnouncement),
        )
        if (!channel || !channel.isTextBased()) {
            await choice.update({
                content: '⚠️ Canal #vagas não encontrado.',
                components: [],
            })
            return
        }

        try {
            await channel.send({
                content: preview,
                allowedMentions: { roles: roleIds },
            })
            await choice.update({
                content: `✅ Publicado em <#${channel.id}>.`,
                components: [],
            })
            infoLog({
                message: `vaga posted to #${channel.name} by ${chat.user.tag} (${roleIds.length} roles tagged)`,
            })
        } catch (error) {
            errorLog({ message: 'Failed to publish vaga:', error })
            await choice.update({
                content: '⚠️ Erro ao publicar a vaga.',
                components: [],
            })
        }
    },
})
