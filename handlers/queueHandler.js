export const createQueue = async ({ client, interaction }) => {
  return await client.player.createQueue(interaction.guild);
}

export const queueConnect = async ({ queue, interaction }) => {
  if (queue.connection) return;
  await queue.connect(interaction.member.voice.channel);
}