import chalk from "chalk";
import * as Sentry from "@sentry/node";

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

// Initialize Sentry if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
  });
}

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
  }
}

export const infoLog = ({ message, level = LogLevel.INFO, data }: LogParams): void => {
  if (shouldLog(level)) {
    console.info(chalk.blue(`${message}\n`