import chalk from 'chalk';
import { infoLog } from '../utils/log';
export const name = 'ready';
export const once = true;
export function execute(client) {
    infoLog({ message: `Logged in as ${chalk.white(client.user?.tag)}!` });
}
//# sourceMappingURL=ready.js.map