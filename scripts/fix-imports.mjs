import fs from 'fs';
import { glob } from 'glob';

// Find all TypeScript files
const files = await glob('src/**/*.ts');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Add .js extensions to relative imports, but ignore discord.js
  content = content.replace(/from\s+['"]([^'"]+)['"]/g, (match, importPath) => {
    // Skip if it's discord.js or another package import
    if (importPath.startsWith('.') && !importPath.endsWith('.js') && !importPath.includes('discord.js')) {
      return `from '${importPath}.js'`;
    }
    return match;
  });
  
  // Remove .js extensions from relative imports
  content = content.replace(/from\s+['"]([^'"]+)\.js['"]/g, (match, importPath) => {
    return `from '${importPath}'`;
  });
  
  // Fix path aliases
  content = content.replace(/from\s+['"]@\/([^'"]+)['"]/g, (match, importPath) => {
    return `from '../${importPath}'`;
  });
  
  fs.writeFileSync(file, content);
  console.log(`Fixed imports in ${file}`);
}

console.log('Import fixing complete!'); 