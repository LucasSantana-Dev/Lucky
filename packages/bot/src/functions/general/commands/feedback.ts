import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
} from 'discord.js'
import Command from '../../../models/Command'
import {
    openFeedbackModalAndAwaitSubmit,
    resolveFeedbackTranslator,
    submitFeedback,
} from '../../../services/feedbackService'

// #2477: one of two entry points into the feedback pipeline (the other is the
// "Report this" button on a command error — see commandsHandler.ts). No DMs,
// per decisions/2026-06-18-in-bot-growth.md — this only ever opens from a
// user-run command inside a guild.
export default new Command({
    data: new SlashCommandBuilder()
        .setName('feedback')
        .setDescription(
            'Send feedback, report a bug, or share an idea with the Lucky team',
        ),
    category: 'general',
    execute: async ({ interaction }) => {
        const chat = interaction as ChatInputCommandInteraction
        if (!chat.guild) {
            await chat.reply({
                content: 'This command only works inside a server.',
                ephemeral: true,
            })
            return
        }

        const t = await resolveFeedbackTranslator(chat)
        const modalSubmit = await openFeedbackModalAndAwaitSubmit(chat, t)
        if (!modalSubmit) return

        await submitFeedback(modalSubmit, {}, t)
    },
})
