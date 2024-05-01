const chalk = require('chalk');
const { client, player } = require("../index.js");

const log = {
  info: (message) => console.info(chalk.yellow(message)),
  error: (message) => console.error(chalk.red(message)),
  success: (message) => console.log(chalk.green(message))
};

module.exports = { log };
