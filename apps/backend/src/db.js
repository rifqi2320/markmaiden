import crypto from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://markmaiden:markmaiden@localhost:5432/markmaiden'
const MAX_SHORTLINKS = Number.parseInt(process.env.MAX_SHORTLINKS || '1000', 10)
const MAX_FILE_SIZE_BYTES = Number.parseInt(
  process.env.MAX_FILE_SIZE_BYTES || `${1024 * 1024}`,
  10,
)

const pool = new Pool({
  connectionString: DATABASE_URL,
})

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS shortlinks (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(16) NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= ${MAX_FILE_SIZE_BYTES}),
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS shortlinks_created_at_idx
    ON shortlinks (created_at DESC, id DESC);
`

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function generateCode() {
  return crypto.randomBytes(5).toString('base64url')
}

export function isTextMimeType(mimeType) {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'image/svg+xml'
  )
}

export async function initializeDatabase() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query(CREATE_TABLE_SQL)
      return
    } catch (error) {
      if (attempt === 30) {
        throw error
      }

      await sleep(2000)
    }
  }
}

async function pruneShortlinks(client) {
  await client.query(
    `
      WITH stale AS (
        SELECT id
        FROM shortlinks
        ORDER BY created_at DESC, id DESC
        OFFSET $1
      )
      DELETE FROM shortlinks
      WHERE id IN (SELECT id FROM stale)
    `,
    [MAX_SHORTLINKS],
  )
}

export async function createShortlink({ filename, mimeType, content }) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    let insertedRow = null

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const code = generateCode()

      try {
        const result = await client.query(
          `
            INSERT INTO shortlinks (code, filename, mime_type, size_bytes, content)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING code, filename, mime_type, size_bytes, created_at
          `,
          [code, filename, mimeType, content.length, content],
        )
        insertedRow = result.rows[0]
        break
      } catch (error) {
        if (error.code !== '23505') {
          throw error
        }
      }
    }

    if (!insertedRow) {
      throw new Error('Failed to create a unique shortlink code.')
    }

    await pruneShortlinks(client)
    await client.query('COMMIT')
    return insertedRow
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getShortlink(code) {
  const result = await pool.query(
    `
      SELECT code, filename, mime_type, size_bytes, content, created_at
      FROM shortlinks
      WHERE code = $1
    `,
    [code],
  )

  return result.rows[0] ?? null
}

export async function updateShortlink({ code, filename, mimeType, content }) {
  const result = await pool.query(
    `
      UPDATE shortlinks
      SET filename = $2,
          mime_type = $3,
          size_bytes = $4,
          content = $5
      WHERE code = $1
      RETURNING code, filename, mime_type, size_bytes, content, created_at
    `,
    [code, filename, mimeType, content.length, content],
  )

  return result.rows[0] ?? null
}

export async function deleteShortlink(code) {
  const result = await pool.query(
    `
      DELETE FROM shortlinks
      WHERE code = $1
      RETURNING code
    `,
    [code],
  )

  return result.rowCount > 0
}
