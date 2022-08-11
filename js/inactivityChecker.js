const { createAudioPlayer } = require('@discordjs/voice')

// Inactivity checker
function inactivityConnDestroy(connection, player) {
    const subscription = connection.subscribe(player);
    if (subscription) {
        // Unsubscribe after 20 seconds (stop playing audio on the voice connection)
        setTimeout(() => subscription.unsubscribe(), 20_000);
    }
}

export function inactivityConnDestroy()