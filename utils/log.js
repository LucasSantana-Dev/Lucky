import chalk from "chalk";

export const errorLog = ({ message, error }) => {
  return console.error(chalk.red(`${message} ${error.message}\n`));
}

export const infoLog = ({ message }) => {
  return console.info(chalk.blue(`${message}\n`));
}

export const successLog = ({ message }) => {
  return console.log(chalk.green(`${message}\n`));
}

export const warnLog = ({ message }) => {
  return console.warn(chalk.yellow(`${message}\n`));
}