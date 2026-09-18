import { createServer } from 'vite'

// This UI is exclusively for the isolated purchase audit backend.
process.env.VITE_API_TARGET = 'http://127.0.0.1:8081'
process.env.VITE_DEV_HOST = '127.0.0.1'
process.env.VITE_DEV_PORT = '3001'
const server = await createServer({ server: { host: '127.0.0.1', port: 3001, strictPort: true } })
await server.listen()
server.printUrls()
