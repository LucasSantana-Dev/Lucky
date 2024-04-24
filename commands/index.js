import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commandFiles = fs.readdirSync(path.join(__dirname, './')).filter(file => file.endsWith('.js'));

const commands = [];

for (const file of commandFiles) {
  if (file === 'index.js') continue; // Skip the index.js file
  const command = await import(`./${file}`);
  commands.push(command.default);
}

export { commands };