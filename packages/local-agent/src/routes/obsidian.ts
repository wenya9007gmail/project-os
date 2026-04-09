import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'

export const obsidianRoute = Router()

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH ?? ''
const VAULT_FOLDER = process.env.OBSIDIAN_FOLDER ?? 'Project OS'

// GET /obsidian/status — check if vault is accessible
obsidianRoute.get('/status', async (_req, res) => {
  if (!VAULT_PATH) {
    return res.json({ available: false, reason: 'OBSIDIAN_VAULT_PATH not set' })
  }
  try {
    await fs.access(VAULT_PATH)
    return res.json({ available: true, vault: VAULT_PATH, folder: VAULT_FOLDER })
  } catch {
    return res.json({ available: false, reason: 'Vault path not accessible' })
  }
})

// POST /obsidian/write — write a note directly to the vault
obsidianRoute.post('/write', async (req, res) => {
  const { relative_path, content } = req.body as { relative_path: string; content: string }

  if (!relative_path || !content) {
    return res.status(400).json({ error: 'relative_path and content are required' })
  }
  if (!VAULT_PATH) {
    return res.status(503).json({ error: 'OBSIDIAN_VAULT_PATH not configured' })
  }

  try {
    const fullPath = path.join(VAULT_PATH, relative_path)
    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
    return res.json({ ok: true, path: fullPath })
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
})
