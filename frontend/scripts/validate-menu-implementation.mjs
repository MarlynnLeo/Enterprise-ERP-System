import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const frontendRoot = path.resolve(path.dirname(scriptPath), '..')

const sourceFiles = [
  'src/components/layout/SidebarMenu.vue',
  'src/views/Layout.vue'
]

const legacyMenuPatterns = [
  /<el-menu(?:[\s>]|-)/,
  /<el-sub-menu(?:[\s>]|-)/,
  /<el-menu-item(?:[\s>]|-)/,
  /default-openeds\s*[:=]/,
  /collapse-transition\s*[:=]/
]

const readText = (filePath) => fs.readFileSync(filePath, 'utf8')

export function validateMenuSource({ sidebarMenu, layout }) {
  const errors = []

  if (!/\bapp-menu-list\b/.test(sidebarMenu)) {
    errors.push('SidebarMenu.vue must render the native app-menu-list tree')
  }

  const files = [
    ['SidebarMenu.vue', sidebarMenu],
    ['Layout.vue', layout]
  ]
  for (const [fileName, content] of files) {
    for (const pattern of legacyMenuPatterns) {
      if (pattern.test(content)) {
        errors.push(`${fileName} contains a legacy Element Plus menu pattern: ${pattern}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateMenuBuild(distDir) {
  const jsFiles = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(filePath)
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        jsFiles.push(filePath)
      }
    }
  }

  if (!fs.existsSync(distDir)) {
    return {
      valid: false,
      errors: [`Build directory does not exist: ${distDir}`]
    }
  }

  visit(distDir)
  const contents = jsFiles.map((filePath) => ({
    filePath,
    content: readText(filePath)
  }))
  const errors = []

  if (!contents.some(({ content }) => /\bapp-menu-list\b/.test(content))) {
    errors.push('Build output does not contain the native app-menu-list marker')
  }

  for (const { filePath, content } of contents) {
    if (/default-openeds|collapse-transition\s*[:=]/.test(content)) {
      errors.push(`Build output contains a legacy menu marker: ${filePath}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateMenuFiles(root = frontendRoot) {
  const [sidebarPath, layoutPath] = sourceFiles.map((relativePath) => path.join(root, relativePath))
  return validateMenuSource({
    sidebarMenu: readText(sidebarPath),
    layout: readText(layoutPath)
  })
}

function printResult(result) {
  if (result.valid) {
    console.log('Menu implementation validation passed')
    return
  }

  for (const error of result.errors) {
    console.error(`Menu implementation validation failed: ${error}`)
  }
  process.exitCode = 1
}

const invokedPath = process.argv[1]
const isDirectInvocation = invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url

if (isDirectInvocation) {
  const distIndex = process.argv.indexOf('--dist')
  if (distIndex !== -1) {
    const distDir = process.argv[distIndex + 1]
    if (!distDir) {
      console.error('Usage: node scripts/validate-menu-implementation.mjs [--dist <directory>]')
      process.exitCode = 1
    } else {
      printResult(validateMenuBuild(path.resolve(distDir)))
    }
  } else {
    printResult(validateMenuFiles())
  }
}
