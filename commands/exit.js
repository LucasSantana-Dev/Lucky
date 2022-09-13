const { SlashCommandBuilder } = require("@discordjs/builders")

module.exports ={
    data: new SlashCommandBuilder()
        .setName("exit")
        .setDescription("🚪 Sai do canal de voz."),
    execute: async ({client, interaction}) => {
        const queue = client.player.getQueue(interaction.guild);

        if (!queue){
            await interaction.reply("🤔 Não tem nenhuma música tocando no momento.")
            return;
        }

        queue.destroy();

        await interaction.reply("😭 Adeeeeus")
    }
}