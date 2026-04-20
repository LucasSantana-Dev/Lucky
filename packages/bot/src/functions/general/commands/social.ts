import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import type { User } from 'discord.js'
import { COLOR } from '@lucky/shared/constants'
import { infoLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'

// Curated GIF pool per action. Sourced from Tenor's public CDN URLs so no
// runtime API call is needed. Rotates deterministically by (sender, action,
// day) so the same pair doesn't see the same GIF twice in a row.
const ACTION_GIFS: Record<string, string[]> = {
    hug: [
        'https://media.tenor.com/kCZjTqCKiggAAAAC/anime-hug.gif',
        'https://media.tenor.com/0liDUJhvQ_QAAAAC/hug-anime.gif',
        'https://media.tenor.com/u25ZXH7OUBIAAAAC/anime-hug.gif',
        'https://media.tenor.com/9e1aE_xBLCwAAAAC/hug.gif',
    ],
    pat: [
        'https://media.tenor.com/Eh7FZcUw_gIAAAAC/anime-pat.gif',
        'https://media.tenor.com/B43gCecRXVoAAAAC/head-pat.gif',
        'https://media.tenor.com/wZgROLqtZ-YAAAAC/anime-head-pat.gif',
    ],
    kiss: [
        'https://media.tenor.com/_9l5C0EVvEMAAAAC/anime-kiss.gif',
        'https://media.tenor.com/AsPHaOdNuhEAAAAC/anime-kiss.gif',
        'https://media.tenor.com/HWM1Vu69jvAAAAAC/anime-kiss.gif',
    ],
    dance: [
        'https://media.tenor.com/ZlSUZjrE0AIAAAAC/anime-dance.gif',
        'https://media.tenor.com/vtI-zDWiRzQAAAAC/dance-anime.gif',
        'https://media.tenor.com/XmmnYOZwfd8AAAAC/dance-anime.gif',
    ],
    bonk: [
        'https://media.tenor.com/qLKzjBCrCpYAAAAC/bonk.gif',
        'https://media.tenor.com/8qNMu9h7cgMAAAAC/bonk-cheems.gif',
    ],
    wave: [
        'https://media.tenor.com/T9XaSrDb_7UAAAAC/anime-wave.gif',
        'https://media.tenor.com/TOw7XZVjhN4AAAAC/hello-anime.gif',
    ],
}

const ACTION_PHRASES: Record<string, (sender: string, target: string) => string> = {
    hug: (s, t) => `${s} hugs ${t} 🤗`,
    pat: (s, t) => `${s} pats ${t} on the head 🫳`,
    kiss: (s, t) => `${s} kisses ${t} 💋`,
    dance: (s, t) => `${s} drags ${t} to the dance floor 💃`,
    bonk: (s, t) => `${s} bonks ${t} 🔨`,
    wave: (s, t) => `${s} waves at ${t} 👋`,
}

const SELF_PHRASES: Record<string, (user: string) => string> = {
    hug: (u) => `${u} hugs themself — awkward but valid 🤗`,
    pat: (u) => `${u} pats their own head — self-care is important 🫳`,
    kiss: (u) => `${u} blows themself a kiss in the mirror 💋`,
    dance: (u) => `${u} busts out a solo dance 💃`,
    bonk: (u) => `${u} bonks themself. Why? 🔨`,
    wave: (u) => `${u} waves at... the void 👋`,
}

const ACTIONS = Object.keys(ACTION_GIFS) as Array<keyof typeof ACTION_GIFS>

function pickGif(action: string, seed: string): string {
    const pool = ACTION_GIFS[action]
    if (!pool || pool.length === 0) return ''
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0
    }
    return pool[Math.abs(hash) % pool.length]
}

function buildEmbed(
    action: string,
    sender: User,
    target: User | null,
): EmbedBuilder {
    const senderName = sender.displayName ?? sender.username
    const targetName = target ? target.displayName ?? target.username : ''
    const isSelf = target !== null && target.id === sender.id

    const phrase = isSelf
        ? SELF_PHRASES[action](senderName)
        : target
          ? ACTION_PHRASES[action](senderName, targetName)
          : SELF_PHRASES[action](senderName)

    const day = new Date().toISOString().slice(0, 10)
    const seed = `${sender.id}:${target?.id ?? 'self'}:${action}:${day}`

    return new EmbedBuilder()
        .setDescription(phrase)
        .setImage(pickGif(action, seed))
        .setColor(COLOR.LUCKY_PURPLE)
}

export default new Command({
    data: (() => {
        const builder = new SlashCommandBuilder()
            .setName('social')
            .setDescription(
                '🤗 Send a social action — hug, pat, kiss, dance, bonk, or wave.',
            )
        for (const action of ACTIONS) {
            builder.addSubcommand((sub) =>
                sub
                    .setName(action)
                    .setDescription(`Send a ${action}.`)
                    .addUserOption((opt) =>
                        opt
                            .setName('user')
                            .setDescription(`Who to ${action}`)
                            .setRequired(false),
                    ),
            )
        }
        return builder
    })(),
    category: 'general',
    execute: async ({ interaction }) => {
        const action = interaction.options.getSubcommand()
        if (!ACTIONS.includes(action as keyof typeof ACTION_GIFS)) {
            await interactionReply({
                interaction,
                content: { content: `❌ Unknown action: ${action}` },
            })
            return
        }

        const target = interaction.options.getUser('user') ?? null
        infoLog({
            message: `social.${action} by ${interaction.user.tag}${target ? ` → ${target.tag}` : ''}`,
        })

        const embed = buildEmbed(action, interaction.user, target)
        await interactionReply({
            interaction,
            content: { embeds: [embed.toJSON()] },
        })
    },
})
