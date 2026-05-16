import { useDeferredValue, useEffect, useId, useState } from 'react'
import {
  Alert,
  Anchor,
  AppShell,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Text,
  Textarea,
  Title,
} from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import mermaid from 'mermaid'
import remarkGfm from 'remark-gfm'

const STARTER_MARKDOWN = `# MarkMaiden Live Markdown

Write markdown on the left, see it rendered on the right, and publish small shareable markdown files with a shortlink.

## Current use case

- Draft markdown notes fast
- Embed Mermaid diagrams inline
- Share a saved note with a shortlink

## Mermaid Example

\`\`\`mermaid
graph TD
    A[Draft note] --> B[Save shortlink]
    B --> C[Open shared link]
    C --> D[Render markdown]
\`\`\`

## Table Example

| Item | Status |
| --- | --- |
| Editor | Ready |
| Preview | Ready |
| Shortlinks | Ready |
`

const MAX_FILE_SIZE_BYTES = 1024 * 1024

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default',
  suppressErrorRendering: true,
})

function formatBytes(size) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function readCodeFromLocation() {
  const match = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)$/)
  return match?.[1] ?? null
}

function goHome() {
  if (window.location.pathname !== '/') {
    window.history.replaceState({}, '', '/')
  }
}

function MermaidBlock({ chart }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const renderId = `mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  useEffect(() => {
    let active = true

    const renderDiagram = async () => {
      try {
        const diagram = chart.trim()

        if (!diagram) {
          if (active) {
            setSvg('')
            setError('Empty Mermaid diagram.')
          }
          return
        }

        await mermaid.parse(diagram)
        const { svg: renderedSvg } = await mermaid.render(renderId, diagram)

        if (active) {
          setSvg(renderedSvg)
          setError('')
        }
      } catch (err) {
        if (active) {
          setSvg('')
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to render Mermaid diagram.',
          )
        }
      }
    }

    renderDiagram()

    return () => {
      active = false
    }
  }, [chart, renderId])

  if (error) {
    return (
      <Paper withBorder radius="md" p="sm" mt="sm" bg="red.0">
        <Group justify="space-between" align="center" mb={4}>
          <Text fw={600} c="red.8">
            Mermaid Error
          </Text>
          <Button
            size="xs"
            variant="light"
            color={copied ? 'teal' : 'red'}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(error)
                setCopied(true)
                setTimeout(() => setCopied(false), 1300)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'Copied' : 'Copy Error'}
          </Button>
        </Group>
        <Text ff="monospace" c="red.9" size="sm">
          {error}
        </Text>
      </Paper>
    )
  }

  return (
    <Box
      className="mermaid-diagram"
      mt="sm"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function App() {
  const [markdown, setMarkdown] = useState(STARTER_MARKDOWN)
  const deferredMarkdown = useDeferredValue(markdown)
  const [status, setStatus] = useState(null)
  const [shareInfo, setShareInfo] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isPreviewOnly, setIsPreviewOnly] = useState(false)

  const setDraft = (value, options = {}) => {
    setMarkdown(value)

    if (options.clearStatus) {
      setStatus(null)
    }
  }

  useEffect(() => {
    const code = readCodeFromLocation()

    if (!code) {
      return
    }

    const loadShortlink = async () => {
      setIsLoading(true)
      setStatus(null)

      try {
        const response = await fetch(`/api/shortlinks/${code}`)
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load the shared file.')
        }

        if (typeof payload.contentText !== 'string') {
          throw new Error('This shortlink does not contain a text file.')
        }

        setMarkdown(payload.contentText)
        setShareInfo(payload)
      } catch (err) {
        goHome()
        setStatus({
          tone: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to load the shared file.',
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadShortlink()
  }, [])

  const activeCode = shareInfo?.code ?? null

  const saveShortlink = async ({ mode, code }) => {
    const isUpdate = mode === 'update'

    if (isUpdate) {
      setIsUpdating(true)
    } else {
      setIsSaving(true)
    }

    setStatus(null)

    try {
      const file = new File([markdown], shareInfo?.filename || 'document.md', {
        type: 'text/markdown;charset=utf-8',
      })
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(
        isUpdate ? `/api/shortlinks/${code}` : '/api/shortlinks',
        {
          method: isUpdate ? 'PUT' : 'POST',
          body: formData,
        },
      )
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(
          payload.error ||
            (isUpdate
              ? 'Failed to update the current shortlink.'
              : 'Failed to create a shortlink.'),
        )
      }

      const shareUrl = new URL(payload.shareUrl)
      window.history.replaceState({}, '', shareUrl.pathname)
      setShareInfo(payload)
      setCopied(false)
      setStatus({
        tone: 'success',
        message: isUpdate
          ? 'Shortlink updated with the latest markdown.'
          : 'Shortlink created for the current markdown file.',
      })
    } catch (err) {
      setStatus({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : isUpdate
              ? 'Failed to update the current shortlink.'
              : 'Failed to create a shortlink.',
      })
    } finally {
      setIsSaving(false)
      setIsUpdating(false)
    }
  }

  const handleCreateShortlink = async () => {
    await saveShortlink({ mode: 'create' })
  }

  const handleUpdateShortlink = async () => {
    if (!activeCode) {
      return
    }

    await saveShortlink({ mode: 'update', code: activeCode })
  }

  const handleDeleteShortlink = async () => {
    if (!activeCode) {
      return
    }

    setIsDeleting(true)
    setStatus(null)

    try {
      const response = await fetch(`/api/shortlinks/${activeCode}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error || 'Failed to delete the current shortlink.')
      }

      goHome()
      setShareInfo(null)
      setCopied(false)
      setStatus({
        tone: 'success',
        message: 'Shortlink deleted. The current draft remains local only.',
      })
    } catch (err) {
      setStatus({
        tone: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to delete the current shortlink.',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCopyLink = async () => {
    if (!shareInfo?.shareUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(shareInfo.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1300)
    } catch {
      setCopied(false)
      setStatus({
        tone: 'error',
        message: 'Clipboard access failed. Copy the link manually.',
      })
    }
  }

  const handleImportFile = async (event) => {
    const file = event.currentTarget.files?.[0]

    if (!file) {
      return
    }

    try {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error('Imported file exceeds the 1 MB shortlink limit.')
      }

      const content = await file.text()
      goHome()
      setShareInfo(null)
      setCopied(false)
      setDraft(content)
      setStatus({
        tone: 'success',
        message: `Loaded ${file.name} into the editor.`,
      })
    } catch (err) {
      setStatus({
        tone: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to read the local file.',
      })
    } finally {
      event.currentTarget.value = ''
    }
  }

  return (
    <AppShell header={{ height: 72 }} className="app-shell" padding={0}>
      <AppShell.Header className="app-header">
        <Container fluid px={14} h="100%">
          <Group justify="space-between" h="100%" wrap="nowrap">
            <Box>
              <Group gap="xs" align="center">
                <Title order={3}>MarkMaiden</Title>
                <Badge size="lg" variant="light" color="teal">
                  Markdown + Mermaid
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                Live editor for markdown notes that can be saved as short-linked files.
              </Text>
              {shareInfo ? (
                <Group gap="xs" mt={6} className="no-print share-inline" wrap="wrap">
                  <Badge size="sm" variant="light" color="blue">
                    {shareInfo.code}
                  </Badge>
                  <Anchor href={shareInfo.shareUrl} size="sm">
                    {shareInfo.shareUrl}
                  </Anchor>
                  <Text size="sm" c="dimmed">
                    {shareInfo.filename} · {formatBytes(shareInfo.sizeBytes)}
                  </Text>
                </Group>
              ) : null}
            </Box>

            <Group gap="xs" className="no-print header-actions">
              {shareInfo ? (
                <Button
                  size="xs"
                  variant="default"
                  onClick={handleCopyLink}
                >
                  {copied ? 'Copied' : 'Copy Link'}
                </Button>
              ) : null}
              <Button
                size="xs"
                variant={isPreviewOnly ? 'light' : 'default'}
                color={isPreviewOnly ? 'teal' : 'gray'}
                onClick={() => setIsPreviewOnly((current) => !current)}
              >
                {isPreviewOnly ? 'Show Editor' : 'Preview Only'}
              </Button>
              {activeCode ? (
                <Button
                  size="xs"
                  variant="light"
                  color="blue"
                  loading={isUpdating}
                  onClick={handleUpdateShortlink}
                >
                  Update Shortlink
                </Button>
              ) : null}
              {activeCode ? (
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  loading={isDeleting}
                  onClick={handleDeleteShortlink}
                >
                  Delete Shortlink
                </Button>
              ) : null}
              <Button
                size="xs"
                variant="default"
                onClick={() => window.print()}
              >
                Print
              </Button>
              <Button
                size="xs"
                color="teal"
                loading={isSaving}
                onClick={handleCreateShortlink}
              >
                Create Shortlink
              </Button>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main className="app-main">
        <Container fluid p={0} className="app-container">
          <Box className="top-stack">
            {status ? (
              <Alert color={status.tone === 'error' ? 'red' : 'teal'} radius="md">
                {status.message}
              </Alert>
            ) : null}

            <SimpleGrid
              cols={isPreviewOnly ? 1 : { base: 1, md: 2 }}
              spacing="sm"
              className="workspace-grid"
            >
              {!isPreviewOnly ? (
                <Paper withBorder radius="md" p="md" className="panel panel-editor">
                  <Group justify="space-between" align="flex-start" mb="sm">
                    <Box>
                      <Text fw={700}>Markdown File</Text>
                      <Text size="sm" c="dimmed">
                        The backend stores uploads up to 1 MB and keeps the newest 1000 files.
                      </Text>
                    </Box>

                    <Group gap="xs" className="no-print">
                      <Button
                        component="label"
                        htmlFor="import-markdown"
                        size="xs"
                        variant="default"
                      >
                        Import File
                      </Button>
                      <input
                        id="import-markdown"
                        type="file"
                        accept=".md,.markdown,.txt,text/markdown,text/plain"
                        hidden
                        onChange={handleImportFile}
                      />
                      <Button
                        variant="default"
                        size="xs"
                        onClick={() => {
                          goHome()
                          setShareInfo(null)
                          setCopied(false)
                          setDraft(STARTER_MARKDOWN, { clearStatus: true })
                          setStatus(null)
                        }}
                      >
                        Insert Template
                      </Button>
                      <Button
                        variant="light"
                        color="red"
                        size="xs"
                        onClick={() => {
                          goHome()
                          setShareInfo(null)
                          setCopied(false)
                          setDraft('', { clearStatus: true })
                          setStatus(null)
                        }}
                      >
                        Clear
                      </Button>
                    </Group>
                  </Group>

                  <Textarea
                    value={markdown}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    autosize={false}
                    className="editor-textarea"
                    placeholder="Write markdown here..."
                  />

                  <Text size="xs" c="dimmed" mt="sm">
                    Current draft size: {formatBytes(new Blob([markdown]).size)} / 1 MB
                  </Text>
                </Paper>
              ) : null}

              <Paper withBorder radius="md" p="md" className="panel panel-preview">
                <Group justify="space-between" mb="sm">
                  <Box>
                    <Text fw={700}>Rendered Preview</Text>
                    <Text size="sm" c="dimmed">
                      {isLoading
                        ? 'Loading shared file...'
                        : isPreviewOnly
                          ? 'Preview-only mode hides the raw markdown.'
                          : 'Updates live as you type.'}
                    </Text>
                  </Box>
                  <Group gap="xs">
                    {activeCode ? (
                      <Badge size="lg" variant="light" color="blue">
                        Shared Link
                      </Badge>
                    ) : null}
                    <Button
                      size="xs"
                      variant={isPreviewOnly ? 'light' : 'default'}
                      color={isPreviewOnly ? 'teal' : 'gray'}
                      className="no-print"
                      onClick={() => setIsPreviewOnly((current) => !current)}
                    >
                      {isPreviewOnly ? 'Show Editor' : 'Preview Only'}
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      className="no-print"
                      onClick={() => window.print()}
                    >
                      Print
                    </Button>
                  </Group>
                </Group>

                <ScrollArea className="preview-scroll" offsetScrollbars>
                  <Box className="markdown-preview">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ children, className, ...props }) {
                          const content = String(children ?? '').replace(/\n$/, '')
                          const isMermaid = /language-mermaid/.test(className || '')

                          if (isMermaid) {
                            return <MermaidBlock chart={content} />
                          }

                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          )
                        },
                      }}
                    >
                      {deferredMarkdown}
                    </ReactMarkdown>
                  </Box>
                </ScrollArea>
              </Paper>
            </SimpleGrid>
          </Box>
        </Container>

        <Button
          size="sm"
          variant="filled"
          color="teal"
          className="print-fab no-print"
          onClick={() => window.print()}
        >
          Print
        </Button>
      </AppShell.Main>
    </AppShell>
  )
}

export default App
