/* eslint-disable no-case-declarations */
import { SlashCommandBuilder } from '@discordjs/builders';
import ytdl from 'ytdl-core';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import Command from '../../utils/Command.js';
import { deleteContent } from '../utils/deleteContent.js';
import { downloadAudio } from '../utils/downloadAudio.js';
import { downloadVideo } from '../utils/downloadVideo.js';

export default new Command({
  data: new SlashCommandBuilder()
    .setName("download")
    .setDescription("Baixa um conteúdo do youtube")
    .addSubcommand(subcommand =>
      subcommand
        .setName("video")
        .setDescription("🎥 Baixa o vídeo completo")
        .addStringOption(option =>
          option
            .setName("url")
            .setDescription("URL do conteúdo")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("audio")
        .setDescription("🎧 Baixa apenas o áudio.")
        .addStringOption(option =>
          option
            .setName("url")
            .setDescription("URL do conteúdo")
            .setRequired(true)
        )
    ),
  execute: async ({ interaction }) => {
    let outputPath = '';

    try {
      ffmpeg.setFfmpegPath(ffmpegPath);
      let url = interaction.options.getString("url");
      const videoFileName = uuidv4();
      const audioFileName = uuidv4();
      const outputFileName = uuidv4();
      const videoInfo = await ytdl.getInfo(url);
      let videoLength;

      const audioPath = path.resolve(fileURLToPath(import.meta.url), `../../content/${audioFileName}.m4a`);

      await interaction.deferReply(); // Send an initial response

      switch (interaction.options.getSubcommand()) {
        case "video":
          await downloadVideo({ url, interaction, videoFileName, outputFileName, outputPath, videoInfo, videoLength, audioPath })
          break;
        case "audio":
          await downloadAudio({ url, interaction, videoInfo, outputFileName, audioPath })
          break;
      }
    } catch (err) {
      await interaction.editReply({ // Edit the initial response
        content: "Desculpe, ocorreu um erro ao baixar o conteúdo. Por favor, tente novamente."
      });

      console.error(err);
    } finally {
      if (fs.existsSync(outputPath)) await deleteContent(outputPath);
    }
  }
});