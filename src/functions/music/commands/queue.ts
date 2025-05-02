import { SlashCommandBuilder } from '@discordjs/builders';
import { Track } from 'discord-player';
import { debugLog, errorLog } from '../../../utils/general/log';
import { interactionReply } from '../../../utils/general/interactionReply';
import Command from '../../../models/Command';
import { createEmbed, EMBED_COLORS, EMOJIS } from '../../../utils/general/embeds';
import { getTrackInfo } from '../../../utils/music/trackUtils';
import { isSimilarTitle } from '../../../utils/music/titleComparison';
import { requireGuild, requireQueue } from '../../../utils/command/commandValidations';
import { CommandExecuteParams } from '../../../types/CommandData';
import { messages } from '../../../utils/general/messages';
import { ColorResolvable } from 'discord.js';

export default new Command({
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('📋 Mostra a fila de música atual'),
    execute: async ({ client, interaction }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return;

        const queue = client.player.nodes.get(interaction.guildId!);
        if (!(await requireQueue(queue, interaction))) return;

        try {
            debugLog({ message: 'Queue status', data: { queueExists: !!queue } });

            // Create the queue embed
            const embed = createEmbed({
                title: 'Fila de Música',
                color: EMBED_COLORS.QUEUE as ColorResolvable,
                emoji: EMOJIS.QUEUE,
                timestamp: true
            });

            // Add current track information
            try {
                const currentTrack = queue!.currentTrack;
                if (currentTrack) {
                    const trackInfo = getTrackInfo(currentTrack);
                    const isAutoplay = currentTrack.requestedBy?.id === client.user?.id;
                    const tag = isAutoplay ? '🤖 Autoplay' : '👤 Manual';
                    
                    // Get next track information
                    let nextTrackInfo = '';
                    const nextTrack = queue!.tracks.at(0);
                    if (nextTrack) {
                        const nextTrackData = getTrackInfo(nextTrack);
                        const isNextAutoplay = nextTrack.requestedBy?.id === client.user?.id;
                        const nextTag = isNextAutoplay ? '🤖 Autoplay' : '👤 Manual';
                        nextTrackInfo = `\n\n⏭️ Próxima música:\n**${nextTrackData.title}**\nDuração: ${nextTrackData.duration}\nSolicitado por: ${nextTrackData.requester}\n${nextTag}`;
                    }
                    
                    embed.addFields({
                        name: '▶️ Tocando Agora',
                        value: `**${trackInfo.title}**\nDuração: ${trackInfo.duration}\nSolicitado por: ${trackInfo.requester}\n${tag}${nextTrackInfo}`
                    });
                } else {
                    embed.addFields({
                        name: '▶️ Tocando Agora',
                        value: 'Nenhuma música está tocando no momento'
                    });
                }
            } catch (currentTrackError) {
                errorLog({ message: 'Error processing current track:', error: currentTrackError });
                embed.addFields({
                    name: '▶️ Tocando Agora',
                    value: messages.error.noTrack
                });
            }

            // Add upcoming tracks
            try {
                // Get tracks safely
                const tracks: Track[] = [];
                const manualTracks: Track[] = [];
                const autoplayTracks: Track[] = [];

                // Safely iterate through tracks
                if (queue!.tracks) {
                    try {
                        // Use the correct method to get tracks
                        const trackArray = queue!.tracks.toArray();
                        debugLog({ message: 'Track array length', data: { length: trackArray.length } });
                        
                        // First, separate tracks into manual and autoplay
                        for (const track of trackArray) {
                            try {
                                if (!track) {
                                    debugLog({ message: 'Skipping null track' });
                                    continue;
                                }
                                
                                // Validate track properties
                                if (!track.title) {
                                    debugLog({ message: 'Track missing title', data: { trackId: track.id } });
                                    continue;
                                }

                                // Check for duplicates
                                const isDuplicate = tracks.some(existingTrack => 
                                    isSimilarTitle(track.title, existingTrack.title)
                                );

                                if (isDuplicate) {
                                    debugLog({ message: 'Skipping duplicate track', data: { 
                                        trackTitle: track.title,
                                        existingTracks: tracks.map(t => t.title)
                                    }});
                                    continue;
                                }
                                
                                if (track.requestedBy?.id === client.user?.id) {
                                    autoplayTracks.push(track);
                                } else {
                                    manualTracks.push(track);
                                }
                                tracks.push(track);
                            } catch (trackError) {
                                errorLog({ message: 'Error processing individual track:', error: trackError });
                                continue;
                            }
                        }

                        // Clear the current queue
                        queue!.tracks.clear();

                        // Add manual tracks first
                        for (const track of manualTracks) {
                            queue!.tracks.add(track);
                        }

                        // Then add autoplay tracks
                        for (const track of autoplayTracks) {
                            queue!.tracks.add(track);
                        }

                    } catch (arrayError) {
                        errorLog({ message: 'Error converting tracks to array:', error: arrayError });
                    }
                }

                debugLog({ message: 'Queue tracks processed', data: { 
                    total: tracks.length,
                    manual: manualTracks.length,
                    autoplay: autoplayTracks.length
                }});

                if (tracks.length > 0) {
                    // Process tracks in smaller batches to avoid potential issues
                    const processedTracks: string[] = [];

                    // Process all tracks in their new order
                    for (let i = 0; i < Math.min(tracks.length, 10); i++) {
                        try {
                            const track = tracks[i];
                            if (!track) continue;

                            const trackInfo = getTrackInfo(track);
                            const isAutoplay = track.requestedBy?.id === client.user?.id;
                            const tag = isAutoplay ? '🤖 Autoplay' : '👤 Manual';
                            
                            processedTracks.push(`${i + 1}. **${trackInfo.title}**\n   Duração: ${trackInfo.duration} | Solicitado por: ${trackInfo.requester} ${tag}`);
                        } catch (trackError) {
                            errorLog({ message: `Error processing track ${i}:`, error: trackError });
                            processedTracks.push(`${i + 1}. **Música desconhecida**`);
                        }
                    }

                    const trackList = processedTracks.join('\n\n');
                    if (trackList) {
                        embed.addFields({
                            name: '📑 Próximas Músicas',
                            value: trackList
                        });

                        const remainingTracks = tracks.length - 10;
                        if (remainingTracks > 0) {
                            const remainingManual = Math.max(0, manualTracks.length - 10);
                            const remainingAutoplay = Math.max(0, autoplayTracks.length - (10 - Math.min(manualTracks.length, 10)));
                            
                            let remainingText = 'E mais ';
                            if (remainingManual > 0) {
                                remainingText += `${remainingManual} músicas manuais`;
                            }
                            if (remainingAutoplay > 0) {
                                if (remainingManual > 0) remainingText += ' e ';
                                remainingText += `${remainingAutoplay} músicas do autoplay`;
                            }
                            remainingText += ' na fila...';

                            embed.addFields({
                                name: '📝 Mais músicas',
                                value: remainingText
                            });
                        }
                    } else {
                        embed.addFields({
                            name: '📑 Próximas Músicas',
                            value: 'Não foi possível carregar as músicas'
                        });
                    }
                } else {
                    embed.addFields({
                        name: '📑 Próximas Músicas',
                        value: 'Não há músicas na fila'
                    });
                }

                // Add queue statistics
                try {
                    const repeatMode = queue!.repeatMode ? 'Ativado' : 'Desativado';
                    const volume = queue!.node.volume || 100;
                    const trackCount = queue!.tracks?.size || 0;
                    const manualCount = manualTracks.length;
                    const autoplayCount = autoplayTracks.length;

                    embed.addFields({
                        name: '📊 Estatísticas da Fila',
                        value: `Total de músicas: ${trackCount}\nMúsicas manuais: ${manualCount}\nMúsicas do autoplay: ${autoplayCount}\nModo de repetição: ${repeatMode}\nVolume: ${volume}%`
                    });
                } catch (statsError) {
                    errorLog({ message: 'Error processing queue statistics:', error: statsError });
                }
            } catch (tracksError) {
                errorLog({ message: 'Error processing tracks list:', error: tracksError });
                embed.addFields({
                    name: '📑 Próximas Músicas',
                    value: messages.error.noTrack
                });
            }

            // Set timestamp
            embed.setTimestamp();

            await interactionReply({
                interaction,
                content: {
                    embeds: [embed],
                },
            });
        } catch (error) {
            errorLog({ message: 'Error in queue command:', error });
            await interactionReply({
                interaction,
                content: {
                    embeds: [createEmbed({
                        title: 'Erro',
                        description: messages.error.noQueue,
                        color: EMBED_COLORS.ERROR as ColorResolvable,
                        emoji: EMOJIS.ERROR
                    })],
                    ephemeral: true
                }
            });
        }
    }
});