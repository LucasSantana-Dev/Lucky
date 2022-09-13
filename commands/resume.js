const { SlashCommandBuilder } = require("@discordjs/builders")

module.exports ={
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("✋ Volta a tocar a musica atual."),
    execute: async ({client, interaction}) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue){
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.")
            return;
        }

        queue.setPause(false);

        await interaction.reply("⏸ A música atual voltou a tocar.")
    }
}