const { startBot } = require("../../start");

const handler = (request, context) => {
  startBot()
  return Response.json({ message: "Bot started!!" })
};

module.exports = { handler };
