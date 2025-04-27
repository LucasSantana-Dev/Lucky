import chalk from "chalk";
// Log levels
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["SUCCESS"] = 3] = "SUCCESS";
    LogLevel[LogLevel["DEBUG"] = 4] = "DEBUG";
})(LogLevel || (LogLevel = {}));
// Current log level - can be changed at runtime
let currentLogLevel = LogLevel.DEBUG;
// Set the log level
export const setLogLevel = (level) => {
    currentLogLevel = level;
};
// Helper to check if a log should be displayed
const shouldLog = (level) => {
    return level <= currentLogLevel;
};
export const errorLog = ({ message, error, level = LogLevel.ERROR }) => {
    if (shouldLog(level)) {
        console.error(chalk.red(`${message} ${error?.message || ''}\n`));
    }
};
export const infoLog = ({ message, level = LogLevel.INFO }) => {
    if (shouldLog(level)) {
        console.info(chalk.blue(`${message}\n`));
    }
};
export const successLog = ({ message, level = LogLevel.SUCCESS }) => {
    if (shouldLog(level)) {
        console.log(chalk.green(`${message}\n`));
    }
};
export const warnLog = ({ message, level = LogLevel.WARN }) => {
    if (shouldLog(level)) {
        console.warn(chalk.yellow(`${message}\n`));
    }
};
export const debugLog = ({ message, level = LogLevel.DEBUG }) => {
    if (shouldLog(level)) {
        console.debug(chalk.gray(`${message}\n`));
    }
};
//# sourceMappingURL=log.js.map