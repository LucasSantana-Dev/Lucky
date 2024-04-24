import chalk from 'chalk'
import { client, player } from "../index.js";

export const log = {
  info: (message) => console.info(chalk.yellow(message)),
  error: (message) => console.error(chalk.red(message)),
  success: (message) => console.log(chalk.green(message))
}