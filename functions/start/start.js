const startBot = require("../../start.js");

// Docs on event and context https://docs.netlify.com/functions/build/#code-your-function-2
const handler = async (event) => {
  try {
    await startBot.startBot();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `The bot has been started` }),
    }
  } catch (error) {
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }