export const createQueue = async ({ client, interaction }) => {
    return client.player.nodes.create(interaction.guild);
};
export const queueConnect = async ({ queue, interaction }) => {
    if (queue.connection)
        return;
    await queue.connect(interaction.member?.voice.channel);
};
//# sourceMappingURL=queueHandler.js.map