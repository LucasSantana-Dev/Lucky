const { SlashCommandBuilder } = require("@discordjs/builders")

module.exports ={
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("✋ Pausa a musica atual."),
    execute: async ({client, interaction}) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue){
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.")
            return;
        }

        queue.setPause(true);

        await interaction.reply("⏸ A música atual foi pausada.")
    }
}