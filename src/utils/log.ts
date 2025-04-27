import chalk from "chalk";

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  SUCCESS = 3,
  DEBUG = 4
}

// Current log level - can be changed at runtime
let currentLogLevel = LogLevel.DEBUG;

interface LogParams {
  message: string;
  error?: Error | any;
  level?: LogLevel;
}

// Set the log level
export const setLogLevel = (level: LogLevel): void => {
  currentLogLevel = level;
};

// Helper to check if a log should be displayed
const shouldLog = (level: LogLevel): boolean => {
  return level <= currentLogLevel;
};

export const errorLog = ({ message, error, level = LogLevel.ERROR }: LogParams): void => {
  if (shouldLog(level)) {
    console.error(chalk.red(`${message} ${error?.message || ''}\n`));
  }
}

export const infoLog = ({ message, level = LogLevel.INFO }: LogParams): void => {
  if (shouldLog(level)) {
    console.info(chalk.blue(`${message}\n`));
  }
}

export const successLog = ({ message, level = LogLevel.SUCCESS }: LogParams): void => {
  if (shouldLog(level)) {
    console.log(chalk.green(`${message}\n`));
  }
}

export const warnLog = ({ message, level = LogLevel.WARN }: LogParams): void => {
  if (shouldLog(level)) {
    console.warn(chalk.yellow(`${message}\n`));
  }
}

export const debugLog = ({ message, level = LogLevel.DEBUG }: LogParams): void => {
  if (shouldLog(level)) {
    console.debug(chalk.gray(`${message}\n`));
  }
}