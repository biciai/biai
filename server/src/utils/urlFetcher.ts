import { createWriteStream } from 'fs'
import { unlink } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

export interface FetchedFile {
  path: string
  filename: string
  mimetype: string
}

/**
 * Fetches a file from a URL and saves it to a temporary location
 * @param url The URL to fetch
 * @param destPath The destination path to save the file
 * @returns Information about the fetched file
 */
export async function fetchFileFromUrl(url: string, destPath: string): Promise<FetchedFile> {
  try {
    // Validate URL
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported')
    }

    // Fetch the file
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('No response body received')
    }

    // Extract filename from URL or Content-Disposition header
    let filename = parsedUrl.pathname.split('/').pop() || 'downloaded_file'
    const contentDisposition = response.headers.get('content-disposition')
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '')
      }
    }

    // Get mimetype
    const mimetype = response.headers.get('content-type') || 'application/octet-stream'

    // Validate file type
    const allowedExtensions = ['.csv', '.txt', '.tsv']
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    if (!allowedExtensions.includes(ext)) {
      throw new Error(`File type not allowed. Only ${allowedExtensions.join(', ')} files are supported`)
    }

    // Save to destination
    const writeStream = createWriteStream(destPath)
    await pipeline(Readable.fromWeb(response.body as any), writeStream)

    return {
      path: destPath,
      filename,
      mimetype
    }
  } catch (error: any) {
    // Clean up on error
    try {
      await unlink(destPath)
    } catch {}

    throw new Error(`Failed to fetch file from URL: ${error.message}`)
  }
}
