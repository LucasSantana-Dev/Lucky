import path from 'node:path'
import { access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
    EmbedBuilder,
    type Guild,
    type GuildBasedChannel,
} from 'discord.js'
import {
    autoMessageService,
    autoModService,
    customCommandService,
    embedBuilderService,
    guildSettingsService,
    moderationService,
    roleManagementService,
    twitchNotificationService,
} from '@lucky/shared/services'
import { getPrismaClient } from '@lucky/shared/utils'
import { getTwitchUserByLogin } from '../../../twitch/twitchApi'
import { refreshTwitchSubscriptions } from '../../../twitch'

export type SetupMode = 'dry-run' | 'apply'

export type SetupResult = {
    applied: string[]
    unchanged: string[]
    warnings: string[]
}

type SendableChannel = {
    id: string
    name: string
    send: (_input: unknown) => Promise<unknown>
}

type ChannelMapping = {
    welcome: GuildBasedChannel | null
    leaveLog: GuildBasedChannel | null
    twitchLive: GuildBasedChannel | null
    botCommands: GuildBasedChannel | null
    modLog: GuildBasedChannel | null
    staffAssets: GuildBasedChannel | null
    modLogSendable: SendableChannel | null
    staffAssetsSendable: SendableChannel | null
}

type RoleMapping = {
    adminRoleIds: string[]
    modRoleIds: string[]
    seniorRoleId: string | null
    plenoRoleId: string | null
    juniorRoleId: string | null
}

type EmbedSeed = {
    name: string
    title: string
    description: string
    footer: string
}

type CustomCommandSeed = {
    name: string
    description: string
    response: string
}

type AutoMessageUpsertClient = {
    upsertGuildTypeMessage: (
        guildId: string,
        type: 'welcome' | 'leave',
        data: { message: string },
        options?: { channelId?: string },
    ) => Promise<'created' | 'updated'>
}

type EmbedTemplateUpsertClient = {
    upsertTemplate: (
        guildId: string,
        name: string,
        payload: {
            title?: string
            description?: string
            color?: string
            footer?: string
            image?: string
        },
        createdBy?: string,
    ) => Promise<'created' | 'updated'>
}

type CustomCommandUpsertClient = {
    upsertCommand: (
        guildId: string,
        name: string,
        response: string,
        options?: {
            description?: string
            createdBy?: string
        },
    ) => Promise<'created' | 'updated'>
}

const autoMessageUpsertClient =
    autoMessageService as unknown as AutoMessageUpsertClient
const embedTemplateUpsertClient =
    embedBuilderService as unknown as EmbedTemplateUpsertClient
const customCommandUpsertClient =
    customCommandService as unknown as CustomCommandUpsertClient

export const CRIATIVARIA_CHANNEL_IDS = {
    welcome: '1480261570557640786',
    leaveLog: '985304109722783744',
    twitchLive: '1429607053759877191',
    botCommands: '984669932400820234',
    modLog: '1458213355327197328',
    staffAssets: '968982002701332610',
} as const

const CRIATIVARIA_ROLE_IDS = {
    admin: [
        '998010383858143324',
        '897229914170851358',
        '1460788103722701010',
        '1458512270555480075',
    ],
    mod: ['1458210431435935758', '1460803423082512520'],
    senior: '1458206157574377522',
    pleno: '1458206091367420138',
    junior: '1458205784134389931',
} as const

const CRIATIVARIA_ALLOWED_DOMAINS = [
    'github.com',
    'youtube.com',
    'youtu.be',
    'twitch.tv',
    'discord.com',
    'discord.gg',
    'figma.com',
    'canva.com',
    'linkedin.com',
]

const CRIATIVARIA_BANNED_WORDS = [
    'free nitro',
    'steamgift',
    'discord nitro free',
    'claim your prize',
    'discord-gift',
    'airdrop',
    'crypto giveaway',
]

const CRIATIVARIA_EMBEDS: EmbedSeed[] = [
    {
        name: 'boas-vindas',
        title: 'Bem-vindo(a) à Criativaria',
        description:
            'Aqui a comunidade cresce com colaboração, aprendizado e projetos reais. Leia as regras, escolha seus cargos e bora construir.',
        footer: 'Criativaria • Comunidade de tecnologia',
    },
    {
        name: 'regras',
        title: 'Regras da Comunidade',
        description:
            'Respeito sempre, zero spam, sem conteúdo malicioso e foco em trocas construtivas. Infrações podem gerar advertência ou remoção.',
        footer: 'Criativaria • Convivência saudável',
    },
    {
        name: 'suporte',
        title: 'Canal de Suporte',
        description:
            'Ao pedir ajuda, compartilhe contexto: objetivo, erro, tentativa e stack. Quanto mais claro, mais rápido a comunidade ajuda.',
        footer: 'Criativaria • Ajuda técnica',
    },
]

const CRIATIVARIA_COMMANDS: CustomCommandSeed[] = [
    {
        name: 'regras',
        description: 'Resumo rápido das regras da Criativaria.',
        response:
            'Leia #✧･ﾟregras✧ com atenção. Respeito, sem spam e colaboração acima de tudo.',
    },
    {
        name: 'cargos',
        description: 'Guia para escolher seus cargos.',
        response:
            'Use #✧･ﾟcargos･ﾟ✧ para selecionar cargos e personalizar sua experiência na comunidade.',
    },
    {
        name: 'links',
        description: 'Links úteis da comunidade.',
        response:
            'Links úteis: GitHub, Twitch e conteúdos oficiais ficam em #✧･ﾟanuncios･ﾟ✧ e #✧･ﾟupdates✧･ﾟ.',
    },
    {
        name: 'suporte',
        description: 'Como pedir ajuda de forma eficiente.',
        response:
            'Para suporte: descreva objetivo, erro, stack e o que já tentou. Isso acelera respostas de qualidade.',
    },
]

const WELCOME_MESSAGE =
    '👋 {user.mention}, bem-vindo(a) à **{server}**! Leia #✧･ﾟregras✧, escolha seus cargos em #✧･ﾟcargos･ﾟ✧ e se apresente em #✧･ﾟapresentacao･ﾟ✧.'

const LEAVE_MESSAGE =
    '👋 {user} saiu de **{server}**. Seguimos com {server.memberCount} membros na comunidade.'

function projectRootAsset(relativePath: string): string {
    const direct = path.resolve(process.cwd(), relativePath)
    if (existsSync(direct)) {
        return direct
    }
    return path.resolve(process.cwd(), '..', '..', relativePath)
}

function toSendableChannel(channel: GuildBasedChannel | null): SendableChannel | null {
    if (!channel || !('send' in channel) || typeof channel.send !== 'function') {
        return null
    }
    const sendable = channel as unknown as SendableChannel
    return sendable
}

function hasGuildChannel(guild: Guild, channelId: string): GuildBasedChannel | null {
    const channel = guild.channels.cache.get(channelId)
    if (!channel) {
        return null
    }
    return channel
}

function hasGuildRole(guild: Guild, roleId: string): boolean {
    return guild.roles.cache.has(roleId)
}

function buildChannelMapping(guild: Guild, result: SetupResult): ChannelMapping {
    const welcome = hasGuildChannel(guild, CRIATIVARIA_CHANNEL_IDS.welcome)
    const leaveLog = hasGuildChannel(guild, CRIATIVARIA_CHANNEL_IDS.leaveLog)
    const twitchLive = hasGuildChannel(guild, CRIATIVARIA_CHANNEL_IDS.twitchLive)
    const botCommands = hasGuildChannel(guild, CRIATIVARIA_CHANNEL_IDS.botCommands)
    const modLog = hasGuildChannel(guild, CRIATIVARIA_CHANNEL_IDS.modLog)
    const staffAssets = hasGuildChannel(guild, CRIATIVARIA_CHANNEL_IDS.staffAssets)

    if (!welcome) result.warnings.push('Canal de boas-vindas não encontrado.')
    if (!leaveLog) result.warnings.push('Canal de saída/log não encontrado.')
    if (!twitchLive) result.warnings.push('Canal de lives não encontrado.')
    if (!botCommands) result.warnings.push('Canal de comandos do bot não encontrado.')
    if (!modLog) result.warnings.push('Canal de log da moderação não encontrado.')
    if (!staffAssets) result.warnings.push('Canal de assets da equipe não encontrado.')

    const modLogSendable = toSendableChannel(modLog)
    const staffAssetsSendable = toSendableChannel(staffAssets)

    if (modLog && !modLogSendable) {
        result.warnings.push('Canal de log da moderação não permite envio de mensagem.')
    }
    if (staffAssets && !staffAssetsSendable) {
        result.warnings.push('Canal de assets da equipe não permite envio de mensagem.')
    }

    return {
        welcome,
        leaveLog,
        twitchLive,
        botCommands,
        modLog,
        staffAssets,
        modLogSendable,
        staffAssetsSendable,
    }
}

function buildRoleMapping(guild: Guild, result: SetupResult): RoleMapping {
    const adminRoleIds = CRIATIVARIA_ROLE_IDS.admin.filter((id) => hasGuildRole(guild, id))
    const modRoleIds = CRIATIVARIA_ROLE_IDS.mod.filter((id) => hasGuildRole(guild, id))

    for (const roleId of CRIATIVARIA_ROLE_IDS.admin) {
        if (!hasGuildRole(guild, roleId)) {
            result.warnings.push(`Cargo admin não encontrado: ${roleId}`)
        }
    }

    for (const roleId of CRIATIVARIA_ROLE_IDS.mod) {
        if (!hasGuildRole(guild, roleId)) {
            result.warnings.push(`Cargo mod não encontrado: ${roleId}`)
        }
    }

    const seniorRoleId = hasGuildRole(guild, CRIATIVARIA_ROLE_IDS.senior)
        ? CRIATIVARIA_ROLE_IDS.senior
        : null
    const plenoRoleId = hasGuildRole(guild, CRIATIVARIA_ROLE_IDS.pleno)
        ? CRIATIVARIA_ROLE_IDS.pleno
        : null
    const juniorRoleId = hasGuildRole(guild, CRIATIVARIA_ROLE_IDS.junior)
        ? CRIATIVARIA_ROLE_IDS.junior
        : null

    if (!seniorRoleId) result.warnings.push('Cargo Senior não encontrado para exclusividade.')
    if (!plenoRoleId) result.warnings.push('Cargo Pleno não encontrado para exclusividade.')
    if (!juniorRoleId) result.warnings.push('Cargo Junior não encontrado para exclusividade.')

    return {
        adminRoleIds,
        modRoleIds,
        seniorRoleId,
        plenoRoleId,
        juniorRoleId,
    }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath)
        return true
    } catch {
        return false
    }
}

async function applyBrandingAssets(
    guild: Guild,
    mode: SetupMode,
    staffAssetsChannel: SendableChannel | null,
    result: SetupResult,
): Promise<string | null> {
    if (mode === 'dry-run') {
        result.applied.push(
            'Perfil visual do servidor preservado (sem mudanças de ícone/splash/banner).',
        )
        result.applied.push(
            'Planejado: reutilizar/upload da imagem estática da Criativaria para templates no canal da equipe.',
        )
        return null
    }

    result.applied.push(
        'Perfil visual do servidor preservado (sem mudanças de ícone/splash/banner).',
    )

    const cachedTemplate = await embedBuilderService.getTemplate(guild.id, 'boas-vindas')
    const cachedImage = cachedTemplate?.image
    if (cachedImage?.startsWith('https://cdn.discordapp.com/')) {
        result.unchanged.push('Imagem CDN existente reutilizada para templates.')
        return cachedImage
    }

    const welcomeImagePath = projectRootAsset('assets/criativaria-banner.png')
    const welcomeImageAvailable = await fileExists(welcomeImagePath)
    if (!welcomeImageAvailable) {
        result.warnings.push(
            'Arquivo de imagem estática da Criativaria não encontrado: assets/criativaria-banner.png',
        )
        return null
    }

    if (!staffAssetsChannel) {
        result.warnings.push('Sem canal de assets disponível para upload da imagem estática da Criativaria.')
        return null
    }

    try {
        const message = (await staffAssetsChannel.send({
            content: 'Lucky setup asset cache: criativaria static banner',
            files: [welcomeImagePath],
        })) as { attachments?: Map<string, { url: string }> | { first?: () => { url: string } | undefined } }

        let imageUrl: string | null = null
        const attachments = (message as { attachments?: { first?: () => { url: string } | undefined } }).attachments
        if (attachments?.first) {
            imageUrl = attachments.first()?.url ?? null
        }

        if (!imageUrl) {
            result.warnings.push('Upload da imagem estática da Criativaria não retornou URL válida.')
            return null
        }

        result.applied.push(
            'Imagem estática da Criativaria enviada ao canal da equipe e vinculada aos templates.',
        )
        return imageUrl
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result.warnings.push(
            `Falha no upload da imagem estática da Criativaria (continuando sem imagem CDN): ${message}`,
        )
        return null
    }
}

async function ensureGuildRecord(guild: Guild): Promise<{ id: string }> {
    const prisma = getPrismaClient()
    const record = await prisma.guild.upsert({
        where: { discordId: guild.id },
        create: {
            discordId: guild.id,
            name: guild.name,
            ownerId: guild.ownerId,
            icon: guild.iconURL() ?? null,
        },
        update: {
            name: guild.name,
            ownerId: guild.ownerId,
            icon: guild.iconURL() ?? null,
        },
        select: { id: true },
    })

    return record
}

async function applyModeration(
    guild: Guild,
    channels: ChannelMapping,
    roles: RoleMapping,
    mode: SetupMode,
    result: SetupResult,
): Promise<void> {
    if (mode === 'dry-run') {
        result.applied.push('Planejado: aplicar configurações de moderação.')
        return
    }

    await moderationService.updateSettings(guild.id, {
        autoModEnabled: true,
        maxWarnings: 3,
        warningExpiry: 2592000,
        dmOnAction: true,
        requireReason: true,
        modLogChannelId: channels.modLog?.id ?? null,
        modRoleIds: roles.modRoleIds,
        adminRoleIds: roles.adminRoleIds,
    })

    result.applied.push('Configurações de moderação atualizadas.')
}

async function applyAutoMod(
    guild: Guild,
    channels: ChannelMapping,
    roles: RoleMapping,
    mode: SetupMode,
    result: SetupResult,
): Promise<void> {
    const exemptChannels = [
        channels.modLog?.id,
        channels.staffAssets?.id,
        channels.leaveLog?.id,
        channels.botCommands?.id,
    ].filter((id): id is string => Boolean(id))

    const exemptRoles = [...new Set([...roles.adminRoleIds, ...roles.modRoleIds])]

    if (mode === 'dry-run') {
        result.applied.push('Planejado: aplicar automod balanceado (spam/caps/links/invites/words).')
        return
    }

    await autoModService.updateSettings(guild.id, {
        enabled: true,
        spamEnabled: true,
        spamThreshold: 6,
        spamTimeWindow: 8,
        capsEnabled: true,
        capsThreshold: 75,
        linksEnabled: true,
        allowedDomains: CRIATIVARIA_ALLOWED_DOMAINS,
        invitesEnabled: true,
        wordsEnabled: true,
        bannedWords: CRIATIVARIA_BANNED_WORDS,
        exemptChannels,
        exemptRoles,
    })

    result.applied.push('Configurações de automod atualizadas.')
}

async function applyGuildSettings(
    guild: Guild,
    mode: SetupMode,
    result: SetupResult,
): Promise<void> {
    if (mode === 'dry-run') {
        result.applied.push('Planejado: aplicar baseline de configurações de guilda.')
        return
    }

    await guildSettingsService.setGuildSettings(guild.id, {
        prefix: '/',
        embedColor: '0x8B5CF6',
        language: 'pt-BR',
        defaultVolume: 50,
        maxQueueSize: 150,
        autoPlayEnabled: true,
        allowDownloads: true,
        allowPlaylists: true,
        allowSpotify: true,
        commandCooldown: 3,
        downloadCooldown: 10,
    })

    result.applied.push('Configurações base da guilda aplicadas.')
}

async function upsertAutoMessage(
    guildId: string,
    type: 'welcome' | 'leave',
    channelId: string,
    message: string,
): Promise<'created' | 'updated'> {
    return await autoMessageUpsertClient.upsertGuildTypeMessage(
        guildId,
        type,
        { message },
        { channelId },
    )
}

async function applyAutoMessages(
    channels: ChannelMapping,
    guild: Guild,
    mode: SetupMode,
    result: SetupResult,
): Promise<void> {
    if (!channels.welcome || !channels.leaveLog) {
        result.warnings.push('Auto-mensagens não aplicadas por canais obrigatórios ausentes.')
        return
    }

    if (mode === 'dry-run') {
        result.applied.push('Planejado: configurar auto-mensagens de entrada e saída em PT-BR.')
        return
    }

    const welcomeResult = await upsertAutoMessage(
        guild.id,
        'welcome',
        channels.welcome.id,
        WELCOME_MESSAGE,
    )

    const leaveResult = await upsertAutoMessage(
        guild.id,
        'leave',
        channels.leaveLog.id,
        LEAVE_MESSAGE,
    )

    result.applied.push(`Auto-mensagem welcome ${welcomeResult}.`)
    result.applied.push(`Auto-mensagem leave ${leaveResult}.`)
}

export async function upsertEmbedTemplate(
    guildId: string,
    seed: EmbedSeed,
    imageUrl: string | null,
): Promise<'created' | 'updated'> {
    const payload = {
        title: seed.title,
        description: seed.description,
        color: '#8B5CF6',
        footer: seed.footer,
        image: imageUrl ?? undefined,
    }

    return await embedTemplateUpsertClient.upsertTemplate(
        guildId,
        seed.name,
        payload,
        'serversetup:criativaria',
    )
}

async function applyEmbedTemplates(
    guild: Guild,
    imageUrl: string | null,
    mode: SetupMode,
    result: SetupResult,
): Promise<void> {
    if (mode === 'dry-run') {
        result.applied.push('Planejado: upsert de templates de embed (boas-vindas/regras/suporte).')
        return
    }

    for (const seed of CRIATIVARIA_EMBEDS) {
        const state = await upsertEmbedTemplate(guild.id, seed, imageUrl)
        result.applied.push(`Template ${seed.name} ${state}.`)
    }
}

export async function upsertCustomCommand(
    guildId: string,
    seed: CustomCommandSeed,
): Promise<'created' | 'updated'> {
    return await customCommandUpsertClient.upsertCommand(
        guildId,
        seed.name,
        seed.response,
        {
            description: seed.description,
            createdBy: 'serversetup:criativaria',
        },
    )
}

async function applyCustomCommands(
    guild: Guild,
    mode: SetupMode,
    result: SetupResult,
): Promise<void> {
    if (mode === 'dry-run') {
        result.applied.push('Planejado: upsert de custom commands (regras/cargos/links/suporte).')
        return
    }

    for (const seed of CRIATIVARIA_COMMANDS) {
        const state = await upsertCustomCommand(guild.id, seed)
        result.applied.push(`Custom command ${seed.name} ${state}.`)
    }
}

async function applyRoleExclusions(
    guild: Guild,
    roles: RoleMapping,
    mode: SetupMode,
    result: SetupResult,
): Promise<void> {
    const senior = roles.seniorRoleId
    const pleno = roles.plenoRoleId
    const junior = roles.juniorRoleId

    if (!senior || !pleno || !junior) {
        result.warnings.push('Regras de exclusividade de cargos parcialmente ignoradas por cargos ausentes.')
        return
    }

    if (mode === 'dry-run') {
        result.applied.push('Planejado: aplicar exclusividade Senior/Pleno/Junior.')
        return
    }

    await roleManagementService.setExclusiveRole(guild.id, senior, pleno)
    await roleManagementService.setExclusiveRole(guild.id, senior, junior)
    await roleManagementService.setExclusiveRole(guild.id, pleno, junior)

    result.applied.push('Regras de exclusividade de cargos aplicadas.')
}

function getLastFmIssues(): string[] {
    const issues: string[] = []
    if (!process.env.LASTFM_API_KEY || !process.env.LASTFM_API_SECRET) {
        issues.push('Last.fm incompleto: faltam LASTFM_API_KEY/LASTFM_API_SECRET.')
    }
    if (!process.env.LASTFM_LINK_SECRET && !process.env.WEBAPP_SESSION_SECRET) {
        issues.push('Last.fm link secret ausente: configure LASTFM_LINK_SECRET ou WEBAPP_SESSION_SECRET.')
    }
    return issues
}

async function applyTwitchSeed(
    channels: ChannelMapping,
    guild: Guild,
    mode: SetupMode,
    result: SetupResult,
): Promise<void> {
    if (!channels.twitchLive) {
        result.warnings.push('Twitch seed ignorado: canal de live ausente.')
        return
    }

    if (mode === 'dry-run') {
        result.applied.push('Planejado: seed Twitch para login criativaria no canal de live.')
        return
    }

    const twitchUser = await getTwitchUserByLogin('criativaria')
    if (!twitchUser) {
        result.warnings.push('Twitch seed falhou: usuário criativaria não encontrado na API Twitch.')
        return
    }

    const guildRecord = await ensureGuildRecord(guild)
    const added = await twitchNotificationService.add(
        guildRecord.id,
        channels.twitchLive.id,
        twitchUser.id,
        twitchUser.login,
    )

    if (!added) {
        result.warnings.push('Twitch seed falhou: não foi possível salvar notificação.')
        return
    }

    try {
        await refreshTwitchSubscriptions()
    } catch {
        result.warnings.push('Twitch seed aplicado, mas refresh de subscriptions falhou.')
    }

    result.applied.push('Notificação Twitch para criativaria configurada.')
}

function summarySection(title: string, items: string[]): string {
    if (items.length === 0) {
        return `${title}\n- nenhum item`
    }
    return `${title}\n${items.map((item) => `- ${item}`).join('\n')}`
}

export function resolveSetupMode(modeValue: string | null): SetupMode {
    if (modeValue === 'dry-run') {
        return 'dry-run'
    }
    return 'apply'
}

export function formatCriativariaSummary(result: SetupResult, mode: SetupMode): string {
    const header = mode === 'dry-run'
        ? '🧪 **Criativaria setup (dry-run)**'
        : '✅ **Criativaria setup aplicado**'

    return [
        header,
        summarySection('Aplicado/Planejado', result.applied),
        summarySection('Sem alteração', result.unchanged),
        summarySection('Avisos', result.warnings),
    ].join('\n\n')
}

async function postSummaryToModLog(
    channels: ChannelMapping,
    result: SetupResult,
): Promise<void> {
    if (!channels.modLogSendable) {
        return
    }

    const color = result.warnings.length > 0 ? 0xf59e0b : 0x22c55e
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('Lucky • Setup Criativaria concluído')
        .setDescription(formatCriativariaSummary(result, 'apply'))

    await channels.modLogSendable.send({ embeds: [embed] })
}

export async function runCriativariaSetup(
    guild: Guild,
    mode: SetupMode,
): Promise<SetupResult> {
    const result: SetupResult = {
        applied: [],
        unchanged: [],
        warnings: [],
    }

    const channels = buildChannelMapping(guild, result)
    const roles = buildRoleMapping(guild, result)

    for (const issue of getLastFmIssues()) {
        result.warnings.push(issue)
    }

    const runStep = async (
        label: string,
        operation: () => Promise<void>,
    ): Promise<void> => {
        try {
            await operation()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            result.warnings.push(`${label}: ${message}`)
        }
    }

    let imageUrl: string | null = null

    await runStep('Branding', async () => {
        imageUrl = await applyBrandingAssets(
            guild,
            mode,
            channels.staffAssetsSendable,
            result,
        )
    })
    await runStep('Configuração de moderação', async () =>
        applyModeration(guild, channels, roles, mode, result),
    )
    await runStep('Configuração de automod', async () =>
        applyAutoMod(guild, channels, roles, mode, result),
    )
    await runStep('Configuração da guilda', async () =>
        applyGuildSettings(guild, mode, result),
    )
    await runStep('Auto-mensagens', async () =>
        applyAutoMessages(channels, guild, mode, result),
    )
    await runStep('Templates de embed', async () =>
        applyEmbedTemplates(guild, imageUrl, mode, result),
    )
    await runStep('Custom commands', async () =>
        applyCustomCommands(guild, mode, result),
    )
    await runStep('Exclusividade de cargos', async () =>
        applyRoleExclusions(guild, roles, mode, result),
    )
    await runStep('Seed Twitch', async () =>
        applyTwitchSeed(channels, guild, mode, result),
    )
    if (mode === 'apply') {
        await runStep('Resumo no canal de moderação', async () =>
            postSummaryToModLog(channels, result),
        )
    }

    return result
}
