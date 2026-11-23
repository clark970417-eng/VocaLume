import { createServer, type ServerResponse } from 'node:http'

const host = '127.0.0.1'
const port = 17648
const clients = new Set<ServerResponse>()
let latest = ''
let started: Promise<string> | undefined
const page = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:transparent;display:flex;align-items:flex-end;justify-content:center;height:100vh}#caption{white-space:pre-wrap;text-align:center;color:white;font:600 36px sans-serif;text-shadow:0 2px 4px black;padding:0 1em 1em}</style><div id="caption"></div><script src="/caption.js"></script>'
const script = "const output=document.getElementById('caption');const stream=new EventSource('/events');stream.onmessage=e=>{output.textContent=JSON.parse(e.data)};stream.onerror=()=>{output.textContent=''}"

export function startObsBrowserCaption(): Promise<string> {
  return started ??= new Promise(resolve => {
    const server = createServer((req, res) => {
      if (req.method !== 'GET' || req.headers.host !== host + ':' + port || (req.headers.origin && req.headers.origin !== 'http://' + host + ':' + port)) {
        res.writeHead(403).end()
        return
      }
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'")
      if (req.url === '/events' && clients.size < 16) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        clients.add(res)
        res.once('close', () => clients.delete(res))
        res.write(`data: ${JSON.stringify(latest)}\n\n`)
      } else if (req.url === '/caption.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' }).end(script)
      } else if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page)
      } else {
        res.writeHead(404).end()
      }
    })
    server.once('error', () => { started = undefined; resolve('') })
    server.listen(port, host, () => {
      server.unref()
      resolve('http://' + host + ':' + port + '/')
    })
  })
}

export function pushObsBrowserCaption(text: string): void {
  if (text === latest) return
  latest = text
  const event = `data: ${JSON.stringify(text)}\n\n`
  for (const client of clients) {
    if (client.writableLength > 8192) client.destroy()
    else client.write(event)
  }
}
