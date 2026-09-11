import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const frontendRoot = path.resolve(path.dirname(scriptPath), '..')

const readText = (relativePath, root = frontendRoot) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const collectVueFiles = (directory) => {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectVueFiles(filePath))
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      files.push(filePath)
    }
  }
  return files
}

export function validateOperationColumnSource({ main, router }) {
  const errors = []

  if (!/import\s+\{\s*startOperationColumnAutoWidth\s*\}\s+from\s+['"]@\/plugins\/operationColumnAutoWidth['"]/.test(main)) {
    errors.push('main.js must import startOperationColumnAutoWidth from the shared plugin')
  }

  if (!/app\.mount\(['"]#app['"]\)\s*\n\s*startOperationColumnAutoWidth\(document\.body\)/.test(main)) {
    errors.push('main.js must start operation-column sizing immediately after app.mount')
  }

  if (/operationColumnAutoWidth|startOperationColumnAutoWidth/.test(router)) {
    errors.push('router/index.js must not own operation-column sizing startup')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateOperationColumnMarkers(root = frontendRoot) {
  const errors = []
  const sourceRoot = path.join(root, 'src')

  for (const filePath of collectVueFiles(sourceRoot)) {
    const content = fs.readFileSync(filePath, 'utf8')
    const tableColumnTags = content.match(/<el-table-column\b[^>]*>/g) || []

    for (const tag of tableColumnTags) {
      if (!/\blabel\s*=\s*['"]操作['"]/.test(tag)) continue
      if (!/\bclass-name\s*=\s*['"]operation-column['"]/.test(tag)) {
        errors.push(`${path.relative(root, filePath)} operation column must use class-name="operation-column"`)
      }
      if (!/\bheader-class-name\s*=\s*['"]operation-column-header['"]/.test(tag)) {
        errors.push(`${path.relative(root, filePath)} operation column must use header-class-name="operation-column-header"`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateOperationColumnFiles(root = frontendRoot) {
  const sourceResult = validateOperationColumnSource({
    main: readText('src/main.js', root),
    router: readText('src/router/index.js', root)
  })
  const markerResult = validateOperationColumnMarkers(root)

  return {
    valid: sourceResult.valid && markerResult.valid,
    errors: [...sourceResult.errors, ...markerResult.errors]
  }
}

const printResult = (result) => {
  if (result.valid) {
    console.log('Operation-column system validation passed')
    return
  }

  for (const error of result.errors) {
    console.error(`Operation-column system validation failed: ${error}`)
  }
  process.exitCode = 1
}

const invokedPath = process.argv[1]
const isDirectInvocation = invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url

if (isDirectInvocation) {
  printResult(validateOperationColumnFiles())
}
