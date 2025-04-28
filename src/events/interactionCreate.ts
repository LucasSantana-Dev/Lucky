import { ChatInputCommandInteraction, Interaction, MessageFlags, EmbedBuilder } from 'discord.js';
import { CustomClient } from '@/types';
import { errorLog, infoLog } from '@utils/log';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction: Interaction) {
    infoLog({ message: `Interaction received: ${interaction.type} from ${interaction.user?.tag || 'unknown user'}` });
    
    // Only handle chat input commands
    if (!(interaction as any).isChatInputCommand?.()) {
        infoLog({ message: `Ignoring non-chat input command interaction: ${interaction.type}` });
        return;
    }
    
    // Now we know it's a ChatInputCommandInteraction
    const chatInteraction = interaction as unknown as ChatInputCommandInteraction;
    infoLog({ message: `Processing chat command: ${chatInteraction.commandName} from ${chatInteraction.user.tag} in ${chatInteraction.guild?.name || 'DM'}` });
    
    const client = interaction.client as CustomClient;
    const command = client.commands.get(chatInteraction.commandName);

    if (!command) {
        errorLog({ message: `No command matching ${chatInteraction.commandName} was found.` });
        try {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Comando Não Encontrado')
                .setDescription(`O comando \`/${chatInteraction.commandName}\` não existe.`)
                .setTimestamp()
                .setFooter({ 
                    text: `Solicitado por ${chatInteraction.user.tag}`,
                    iconURL: chatInteraction.user.displayAvatarURL()
                });
                
            await chatInteraction.reply({ 
                embeds: [errorEmbed],
                flags: [MessageFlags.Ephemeral]
            });
        } catch (error) {
            errorLog({ message: 'Error sending command not found message', error });
        }
        return;
    }

    infoLog({ message: `Executing command: ${chatInteraction.commandName}` });
    try {
        await command.execute({ interaction: chatInteraction, client });
    } catch (error) {
        errorLog({ message: `Error executing command ${chatInteraction.commandName}:`, error });
        try {
            if (!chatInteraction.replied && !chatInteraction.deferred) {
                await chatInteraction.reply({ 
                    content: 'Ocorreu um erro ao executar este comando. Por favor, tente novamente mais tarde.',
                    ephemeral: true 
                });
            }
        } catch (replyError) {
            errorLog({ message: 'Error sending error message:', error: replyError });
        }
    }
} 