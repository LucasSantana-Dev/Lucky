import "module-alias/register"
import { addAliases } from "module-alias"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const fileName = fileURLToPath(import.meta.url)
const dirName = dirname(fileName)

addAliases({
    "@": resolve(dirName, "../dist"),
    "@models": resolve(dirName, "../dist/models"),
    "@utils": resolve(dirName, "../dist/utils"),
    "@handlers": resolve(dirName, "../dist/handlers"),
    "@functions": resolve(dirName, "../dist/functions"),
    "@config": resolve(dirName, "../dist/config"),
    "@types": resolve(dirName, "../dist/types"),
    "@commands": resolve(dirName, "../dist/commands"),
    "@events": resolve(dirName, "../dist/events"),
})
