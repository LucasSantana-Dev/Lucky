import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to recursively find all TypeScript files
function findTypeScriptFiles(dir) {
  let results = [];
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      results = results.concat(findTypeScriptFiles(filePath));
    } else if (file.endsWith('.ts')) {
      results.push(filePath);
    }
  }
  
  return results;
}

// Function to fix double extensions in imports
function fixDoubleExtensions(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Regular expression to match imports with .js.js extension
  const importRegex = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]*\.js\.js)['"]/g;
  
  // Replace imports with .js.js extension
  content = content.replace(importRegex, (match, importPath) => {
    // Remove the extra .js
    return match.replace(importPath, importPath.replace('.js.js', '.js'));
  });
  
  fs.writeFileSync(filePath, content);
  console.log(`Fixed double extensions in ${filePath}`);
}

// Main function
function main() {
  const srcDir = path.join(__dirname, 'src');
  const tsFiles = findTypeScriptFiles(srcDir);
  
  console.log(`Found ${tsFiles.length} TypeScript files`);
  
  for (const file of tsFiles) {
    fixDoubleExtensions(file);
  }
  
  console.log('Double extension fixing complete!');
}

main(); 