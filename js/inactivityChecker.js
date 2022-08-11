// const { createAudioPlayer } = require('@discordjs/voice')

// Inactivity checker
exports.inactivityConnDestroy = function (connection, player) {
    const subscription = connection.subscribe(player);
    if (subscription) {
        // Unsubscribe after 20 seconds (stop playing audio on the voice connection)
        setTimeout(() => subscription.unsubscribe(), 20_000);
    }
}