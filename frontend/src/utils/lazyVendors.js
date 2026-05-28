let excelJSPromise
let html2PdfPromise

export const loadExcelJS = async () => {
  if (!excelJSPromise) {
    excelJSPromise = import('exceljs').then((module) => module.default || module)
  }
  return excelJSPromise
}

export const loadHtml2Pdf = async () => {
  if (!html2PdfPromise) {
    html2PdfPromise = import('html2pdf.js').then((module) => module.default || module)
  }
  return html2PdfPromise
}
