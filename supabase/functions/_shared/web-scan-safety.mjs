const RESERVED_SUFFIXES = ['.localhost', '.local', '.internal', '.test', '.example', '.invalid']

export function normalizeWebTarget(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) {
    throw new Error('Enter a public HTTP or HTTPS URL (maximum 500 characters).')
  }
  let url
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a valid absolute HTTP or HTTPS URL.') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP and HTTPS targets are supported.')
  if (url.username || url.password) throw new Error('URLs containing embedded credentials are not accepted.')
  if (url.port && ((url.protocol === 'http:' && url.port !== '80') || (url.protocol === 'https:' && url.port !== '443'))) throw new Error('Only standard HTTP (80) and HTTPS (443) ports are accepted.')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname.startsWith('[') || /^[0-9.]+$/.test(hostname)) {
    throw new Error('IP-literal targets are not accepted. Enter a public hostname instead.')
  }
  if (!hostname.includes('.') || RESERVED_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
    throw new Error('Local, single-label, and reserved hostnames are not accepted.')
  }
  if (hostname.length > 253 || hostname.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw new Error('Enter a valid public DNS hostname.')
  }
  url.hash = ''
  return url
}

export function isPublicIpAddress(value) {
  if (typeof value !== 'string') return false
  return value.includes(':') ? isPublicIPv6(value) : isPublicIPv4(value)
}

export function isPublicIPv4(value) {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part))) return false
  const [a, b, c, d] = parts.map(Number)
  if ([a, b, c, d].some(part => part > 255)) return false
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && c === 0) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 192 && b === 168) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a === 255 && b === 255 && c === 255) return false
  return true
}

export function isPublicIPv6(value) {
  if (value.includes('%') || value.includes('.')) return false
  const halves = value.toLowerCase().split('::')
  if (halves.length > 2) return false
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (left.concat(right).some(part => !/^[0-9a-f]{1,4}$/.test(part))) return false
  let words
  if (halves.length === 1) {
    if (left.length !== 8) return false
    words = left.map(part => parseInt(part, 16))
  } else {
    const missing = 8 - left.length - right.length
    if (missing < 1) return false
    words = [...left.map(part => parseInt(part, 16)), ...Array(missing).fill(0), ...right.map(part => parseInt(part, 16))]
  }
  const first = words[0], second = words[1]
  if (first < 0x2000 || first > 0x3fff) return false
  if (first === 0x2001 && second <= 0x01ff) return false
  if (first === 0x2001 && second === 0x0db8) return false
  if (first === 0x2001 && (second & 0xfff0) === 0x0020) return false
  if (first === 0x2002) return false
  if (first === 0x3fff && (second & 0xf000) === 0) return false
  return true
}
