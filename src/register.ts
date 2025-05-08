import 'module-alias/register';
import { addAliases } from 'module-alias';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Register path aliases
addAliases({
  '@': resolve(__dirname, '../dist'),
  '@models': resolve(__dirname, '../dist/models'),
  '@utils': resolve(__dirname, '../dist/utils'),
  '@handlers': resolve(__dirname, '../dist/handlers'),
  '@functions': resolve(__dirname, '../dist/functions'),
  '@config': resolve(__dirname, '../dist/config'),
  '@types': resolve(__dirname, '../dist/types'),
  '@commands': resolve(__dirname, '../dist/commands'),
  '@events': resolve(__dirname, '../dist/events')
}); 