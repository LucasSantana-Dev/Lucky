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

// Function to fix imports in a file
function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Regular expression to match relative imports without .js extension
  const importRegex = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]*)(?!\.js)['"]/g;
  
  // Replace imports without .js extension
  content = content.replace(importRegex, (match, importPath) => {
    // Skip if it's not a relative import
    if (!importPath.startsWith('.')) {
      return match;
    }
    
    // Add .js extension
    return match.replace(importPath, `${importPath}.js`);
  });
  
  fs.writeFileSync(filePath, content);
  console.log(`Fixed imports in ${filePath}`);
}

// Main function
function main() {
  const srcDir = path.join(__dirname, 'src');
  const tsFiles = findTypeScriptFiles(srcDir);
  
  console.log(`Found ${tsFiles.length} TypeScript files`);
  
  for (const file of tsFiles) {
    fixImports(file);
  }
  
  console.log('Import fixing complete!');
}

main(); 