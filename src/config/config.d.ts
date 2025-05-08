interface Config {
  TOKEN: string | undefined;
  CLIENT_ID: string | undefined;
  DISCORD_TOKEN: string | undefined;
  COMMANDS_DISABLED: string[];
  COMMAND_CATEGORIES_DISABLED: string[];
  [key: string]: any;
}

export function config(): Config; 