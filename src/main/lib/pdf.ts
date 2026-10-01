import { BrowserWindow } from 'electron'
import type { PdfRenderer } from './sign-in-sheet'
import { traceOperation } from '../../shared/telemetry'

const RENDER_TIMEOUT_MS = 15_000

/**
 * Print a page of HTML to A4 through a hidden window. The window never shows,
 * runs no script, loads nothing but the given markup, and is closed once the
 * bytes are back or the render has taken too long.
 */
export const renderPdfWithElectron: PdfRenderer = (html) =>
  traceOperation('pdf.render', {}, async (span) => {
    const window = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false
      }
    })
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('The document took too long to render')),
        RENDER_TIMEOUT_MS
      )
    })
    const render = async (): Promise<Buffer> => {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      return window.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true
      })
    }
    try {
      const bytes = await Promise.race([render(), timeout])
      span.setAttribute('output_bytes', bytes.length)
      return bytes
    } finally {
      clearTimeout(timer)
      if (!window.isDestroyed()) window.destroy()
    }
  })
