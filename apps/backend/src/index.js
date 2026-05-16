import express from 'express'
import multer from 'multer'
import {
  createShortlink,
  deleteShortlink,
  getShortlink,
  initializeDatabase,
  isTextMimeType,
  updateShortlink,
} from './db.js'

const PORT = Number.parseInt(process.env.PORT || '3000', 10)
const MAX_FILE_SIZE_BYTES = Number.parseInt(
  process.env.MAX_FILE_SIZE_BYTES || `${1024 * 1024}`,
  10,
)

const app = express()

app.set('trust proxy', true)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
})

function buildOrigin(req) {
  const protocol = req.get('x-forwarded-proto') || req.protocol
  const host = req.get('x-forwarded-host') || req.get('host')
  return `${protocol}://${host}`
}

function buildPayload(req, row) {
  const origin = buildOrigin(req)
  const contentBuffer = Buffer.from(row.content)
  const mimeType = row.mime_type.split(';')[0].trim().toLowerCase()

  return {
    code: row.code,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    shareUrl: `${origin}/s/${row.code}`,
    downloadUrl: `${origin}/api/shortlinks/${row.code}/file`,
    contentText: isTextMimeType(mimeType) ? contentBuffer.toString('utf8') : null,
  }
}

function validateCode(code) {
  return /^[A-Za-z0-9_-]{6,16}$/.test(code)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/shortlinks', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Attach a file in the "file" form field.' })
      return
    }

    const mimeType = req.file.mimetype || 'application/octet-stream'
    const filename = req.file.originalname || 'document.md'

    const row = await createShortlink({
      filename,
      mimeType,
      content: req.file.buffer,
    })

    res.status(201).json(buildPayload(req, { ...row, content: req.file.buffer }))
  } catch (error) {
    next(error)
  }
})

app.put('/api/shortlinks/:code', upload.single('file'), async (req, res, next) => {
  try {
    const { code } = req.params

    if (!validateCode(code)) {
      res.status(400).json({ error: 'Invalid shortlink code.' })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: 'Attach a file in the "file" form field.' })
      return
    }

    const mimeType = req.file.mimetype || 'application/octet-stream'
    const filename = req.file.originalname || 'document.md'
    const row = await updateShortlink({
      code,
      filename,
      mimeType,
      content: req.file.buffer,
    })

    if (!row) {
      res.status(404).json({ error: 'Shortlink not found.' })
      return
    }

    res.json(buildPayload(req, row))
  } catch (error) {
    next(error)
  }
})

app.get('/api/shortlinks/:code', async (req, res, next) => {
  try {
    const { code } = req.params

    if (!validateCode(code)) {
      res.status(400).json({ error: 'Invalid shortlink code.' })
      return
    }

    const row = await getShortlink(code)

    if (!row) {
      res.status(404).json({ error: 'Shortlink not found.' })
      return
    }

    res.json(buildPayload(req, row))
  } catch (error) {
    next(error)
  }
})

app.get('/api/shortlinks/:code/file', async (req, res, next) => {
  try {
    const { code } = req.params

    if (!validateCode(code)) {
      res.status(400).json({ error: 'Invalid shortlink code.' })
      return
    }

    const row = await getShortlink(code)

    if (!row) {
      res.status(404).json({ error: 'Shortlink not found.' })
      return
    }

    res.setHeader('Content-Type', row.mime_type)
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(row.filename)}"`,
    )
    res.send(Buffer.from(row.content))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/shortlinks/:code', async (req, res, next) => {
  try {
    const { code } = req.params

    if (!validateCode(code)) {
      res.status(400).json({ error: 'Invalid shortlink code.' })
      return
    }

    const deleted = await deleteShortlink(code)

    if (!deleted) {
      res.status(404).json({ error: 'Shortlink not found.' })
      return
    }

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File exceeds the 1 MB backend storage limit.' })
    return
  }

  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(500).json({
    error: error instanceof Error ? error.message : 'Internal server error.',
  })
})

async function start() {
  await initializeDatabase()

  app.listen(PORT, () => {
    console.log(`markmaiden backend listening on ${PORT}`)
  })
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
