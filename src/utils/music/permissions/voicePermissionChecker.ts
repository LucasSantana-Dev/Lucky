import { PermissionsBitField, type ChatInputCommandInteraction, type VoiceChannel } from 'discord.js'
import { errorLog } from '../../general/log'

/**
 * Comprehensive voice permission checker
 * Based on discord-player best practices
 */
export class VoicePermissionChecker {
    /**
     * Check if user is in a voice channel
     */
    static checkUserVoiceChannel(interaction: ChatInputCommandInteraction): VoiceChannel | null {
        // Check if member is a GuildMember (not APIInteractionGuildMember)
        if (!interaction.member || 'voice' in interaction.member === false) {
            return null
        }

        const voiceChannel = (interaction.member as { voice?: { channel?: VoiceChannel } }).voice?.channel

        if (!voiceChannel) {
            return null
        }

        return voiceChannel
    }

    /**
     * Check if bot is already playing in a different voice channel
     */
    static checkBotVoiceChannel(
        interaction: ChatInputCommandInteraction,
        userVoiceChannel: VoiceChannel
    ): boolean {
        const botVoiceChannel = interaction.guild?.members?.me?.voice?.channel

        if (botVoiceChannel && botVoiceChannel !== userVoiceChannel) {
            return false
        }

        return true
    }

    /**
     * Check if bot has permission to connect to voice channel
     */
    static checkConnectPermission(interaction: ChatInputCommandInteraction): boolean {
        const botMember = interaction.guild?.members?.me

        if (!botMember) {
            return false
        }

        return botMember.permissions.has(PermissionsBitField.Flags.Connect)
    }

    /**
     * Check if bot has permission to speak in voice channel
     */
    static checkSpeakPermission(
        interaction: ChatInputCommandInteraction,
        voiceChannel: VoiceChannel
    ): boolean {
        const botMember = interaction.guild?.members?.me

        if (!botMember) {
            return false
        }

        return botMember.permissionsIn(voiceChannel).has(PermissionsBitField.Flags.Speak)
    }

    /**
     * Comprehensive permission check for music operations
     */
    static async validateMusicPermissions(
        interaction: ChatInputCommandInteraction
    ): Promise<{
        success: boolean
        voiceChannel?: VoiceChannel
        error?: string
    }> {
        try {
            // Check if user is in a voice channel
            const voiceChannel = this.checkUserVoiceChannel(interaction)
            if (!voiceChannel) {
                return {
                    success: false,
                    error: 'You need to be in a voice channel to play music!'
                }
            }

            // Check if bot is already playing in a different voice channel
            if (!this.checkBotVoiceChannel(interaction, voiceChannel)) {
                return {
                    success: false,
                    error: 'I am already playing in a different voice channel!'
                }
            }

            // Check if bot has permission to connect
            if (!this.checkConnectPermission(interaction)) {
                return {
                    success: false,
                    error: 'I do not have permission to join your voice channel!'
                }
            }

            // Check if bot has permission to speak
            if (!this.checkSpeakPermission(interaction, voiceChannel)) {
                return {
                    success: false,
                    error: 'I do not have permission to speak in your voice channel!'
                }
            }

            return {
                success: true,
                voiceChannel
            }
        } catch (error) {
            errorLog({ message: 'Error validating music permissions:', error })
            return {
                success: false,
                error: 'An error occurred while checking permissions'
            }
        }
    }
}
