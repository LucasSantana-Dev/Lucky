import chalk from "chalk";

export const errorLog = (message) => {
  return console.error(chalk.red(message));
}

export const infoLog = (message) => {
  return console.info(chalk.blue(message));
}

export const successLog = (message) => {
  return console.log(chalk.green(message));
}

export const warnLog = (message) => {
  return console.warn(chalk.yellow(message));
}