import path from 'path'
import fs from 'fs'
import { config } from 'dotenv'

let dir = process.cwd()
for (let i = 0; i < 6; i++) {
    const envPath = path.join(dir, '.env')
    if (fs.existsSync(envPath)) {
        config({ path: envPath })
        break
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
}
