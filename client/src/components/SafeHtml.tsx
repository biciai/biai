import { CSSProperties, useMemo } from 'react'
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'a',
  'b',
  'strong',
  'i',
  'em',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'span'
]

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel']

function normalizeHtml(source: string): string {
  if (!source) {
    return ''
  }

  // If the description does not contain HTML tags, keep line breaks by converting to <br />
  if (!/[<>]/.test(source)) {
    return source.replace(/\n/g, '<br />')
  }

  return source
}

function enhanceLinks(html: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return html
  }

  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href') || ''

    // Strip javascript and other unsafe protocols
    const isSafeProtocol = /^(https?:|mailto:|tel:)/i.test(href)
    if (!isSafeProtocol) {
      link.removeAttribute('href')
      return
    }

    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  })

  return template.innerHTML
}

interface SafeHtmlProps {
  html: string
  className?: string
  style?: CSSProperties
}

function SafeHtml({ html, className, style }: SafeHtmlProps) {
  const sanitizedHtml = useMemo(() => {
    const source = normalizeHtml(html)
    const sanitized = DOMPurify.sanitize(source, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORBID_ATTR: ['style']
    })

    return enhanceLinks(sanitized)
  }, [html])

  if (!sanitizedHtml) {
    return null
  }

  return (
    <span
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}

export default SafeHtml
