import {
    readFileSync,
    writeFileSync,
    existsSync,
    statSync,
    readdirSync,
} from 'fs'
import { dirname, join, extname } from 'path'

function findJsFiles(dir, fileList = []) {
    try {
        const files = readdirSync(dir)
        for (const file of files) {
            const filePath = join(dir, file)
            const stat = statSync(filePath)
            if (stat.isDirectory()) {
                findJsFiles(filePath, fileList)
            } else if (extname(file) === '.js') {
                fileList.push(filePath)
            }
        }
    } catch {
        // Ignore errors
    }
    return fileList
}

function resolveImportPath(importPath, baseDir) {
    if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
        return importPath
    }

    const fullPath = join(baseDir, importPath)

    try {
        if (existsSync(fullPath + '.js')) {
            return importPath + '.js'
        }
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
            if (existsSync(join(fullPath, 'index.js'))) {
                return importPath + '/index.js'
            }
            return importPath + '/index.js'
        }
    } catch {
        return importPath + '.js'
    }

    return importPath + '.js'
}

function addExtension(content, filePath) {
    return content.replace(/from ['"](\.[^'"]+)['"]/g, (match, importPath) => {
        const baseDir = dirname(filePath)
        const resolved = resolveImportPath(importPath, baseDir)
        return `from '${resolved}'`
    })
}

const files = findJsFiles('dist')
let updated = 0
for (const file of files) {
    let content = readFileSync(file, 'utf8')
    const newContent = addExtension(content, file)
    if (content !== newContent) {
        writeFileSync(file, newContent)
        updated++
    }
}
console.log(`Updated ${updated} files with .js extensions`)
