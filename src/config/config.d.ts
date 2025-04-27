interface Config {
  TOKEN: string | undefined;
  CLIENT_ID: string | undefined;
  DISCORD_TOKEN: string | undefined;
  [key: string]: string | undefined;
}

export function config(): Config; 