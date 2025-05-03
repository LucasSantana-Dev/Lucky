import chalk from "chalk";
import * as Sentry from "@sentry/node";
import { logToCloudWatch } from "./cloudwatchLog";

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
  data?: any
}

// Set the log level
export const setLogLevel = (level: LogLevel): void => {
  currentLogLevel = level;
};

// Helper to check if a log should be displayed
const shouldLog = (level: LogLevel): boolean => {
  return level <= currentLogLevel;
};

export const errorLog = ({ message, error, level = LogLevel.ERROR, data }: LogParams): void => {
  if (shouldLog(level)) {
    console.error(chalk.red(`${message} ${error?.message || ''}\n`));
    if (data) {
      console.error(chalk.red(data));
    }
    // Send error to Sentry if initialized
    if (process.env.SENTRY_DSN) {
      if (error instanceof Error) {
        Sentry.captureException(error, { extra: { message, data } });
      } else {
        Sentry.captureMessage(message, { level: 'error', extra: { error, data } });
      }
    }
    // Send error to CloudWatch (buffered, only for errors)
    logToCloudWatch('ERROR', message, { error: error?.message || error, data });
  }
}

export const infoLog = ({ message, level = LogLevel.INFO, data }: LogParams): void => {
  if (shouldLog(level)) {
    console.info(chalk.blue(`${message}\n`));
    if (data) { 
      console.info(chalk.blue(data));
    }
  }
}

export const successLog = ({ message, level = LogLevel.SUCCESS, data }: LogParams): void => {
  if (shouldLog(level)) {
    console.log(chalk.green(`${message}\n`));
    if (data) {
      console.log(chalk.green(data));
    }
  }
}

export const warnLog = ({ message, level = LogLevel.WARN, data }: LogParams): void => {
  if (shouldLog(level)) {
    console.warn(chalk.yellow(`${message}\n`));
    if (data) {
      console.warn(chalk.yellow(data));
    }
  }
}

export const debugLog = ({ message, level = LogLevel.DEBUG, data }: LogParams): void => {
  if (shouldLog(level)) {
    console.debug(chalk.gray(`${message}\n`));
    if (data) {
      console.debug(chalk.gray(data));
    }
  }
}