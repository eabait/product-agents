/**
 * Shared export utilities for downloading and copying content
 */

/**
 * Downloads content as a file with the specified filename and MIME type
 */
export function downloadAsFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Downloads markdown content as a .md file
 */
export function downloadMarkdown(content: string, filename?: string): void {
  const timestamp = new Date().toISOString().split('T')[0]
  const finalFilename = filename || `export-${timestamp}.md`
  downloadAsFile(content, finalFilename, 'text/markdown;charset=utf-8')
}

/**
 * Copies text to clipboard using the modern Clipboard API with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    } else {
      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'absolute'
      textArea.style.left = '-999999px'

      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      try {
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        return successful
      } catch {
        document.body.removeChild(textArea)
        return false
      }
    }
  } catch {
    return false
  }
}

/**
 * Copies JSON data to clipboard
 */
export async function copyAsJson(data: unknown): Promise<boolean> {
  return copyToClipboard(JSON.stringify(data, null, 2))
}
