import { SlashCommandBuilder } from '@discordjs/builders';
import ytdl from 'ytdl-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deleteContent } from '../utils/deleteContent.js';
import { downloadAudio } from '../utils/downloadAudio.js';
import { downloadVideo } from '../utils/downloadVideo.js';
import { searchContentOnYoutube } from '../../../utils/searchContentOnYoutube.js';
import Command from '../../../models/Command.js';
import {
  interactionGetOption,
  interactionGetSubcommand,
  interactionReply
} from '../../../handlers/interactionHandler.js';
import { generateFileName } from '../../../utils/generateFileName.js';
import { errorLog } from '../../../utils/log.js';

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
        .addStringOption(option =>
          option
            .setName("pesquisa")
            .setDescription("Termos de Pesquisa")
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
        )
        .addStringOption(option =>
          option
            .setName("pesquisa")
            .setDescription("Termos de Pesquisa")
        )
    ),
  execute: async ({ client, interaction }) => {
    let outputPath = '';

    try {
      await interaction.deferReply(); // Send an initial response

      let url = interactionGetOption({ interaction, optionName: "url" });
      let searchTerms = interactionGetOption({ interaction, optionName: "pesquisa" });

      if (!url && !searchTerms) {
        await interactionReply({ interaction, content: "🤨 Você deve fornecer uma URL ou termos de pesquisa." })

        return errorLog({ message: "No URL or search terms provided." });
      }

      let searchResult;

      if (searchTerms) {
        searchResult = await searchContentOnYoutube({ client, searchTerms, interaction });
        url = searchResult.tracks[0].url;
      }

      const videoFileName = generateFileName({ fileExt: "mp4" });
      const audioFileName = generateFileName({ fileExt: "m4a" });
      const outputFileName = generateFileName({ fileExt: "mp4" });
      const videoInfo = await ytdl.getInfo(url);
      let videoLength;

      const audioPath = path.resolve(fileURLToPath(import.meta.url), `../../content/${audioFileName}`);


      switch (interactionGetSubcommand({ interaction })) {
        case "video":
          await downloadVideo({ url, interaction, videoFileName, outputFileName, outputPath, videoInfo, videoLength, audioPath })
          break;
        case "audio":
          await downloadAudio({ url, interaction, videoInfo, outputFileName, outputPath, audioPath })
          break;
      }
    } catch (error) {
      await interaction.editReply({ // Edit the initial response
        content: "Desculpe, ocorreu um erro ao baixar o conteúdo. Por favor, tente novamente."
      });

      errorLog({ message: "Error downloading content:", error });
    } finally {
      if (fs.existsSync(outputPath)) await deleteContent(outputPath);
    }
  }
});