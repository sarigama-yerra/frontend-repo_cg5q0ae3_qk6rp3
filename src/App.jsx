import { useEffect, useMemo, useRef, useState } from 'react'

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 1200)
    } catch (e) {
      console.error('Copy failed', e)
    }
  }

  return (
    <button onClick={onCopy} className={`text-xs px-2 py-1 rounded border ${copied ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}>
      {copied ? 'Copied' : label}
    </button>
  )
}

function Spinner({ size = '6' }) {
  return (
    <svg className={`animate-spin h-${size} w-${size} text-blue-500`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
    </svg>
  )
}

function App() {
  const baseUrl = useMemo(() => import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000', [])

  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [account, setAccount] = useState(null)
  const [domains, setDomains] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [selected, setSelected] = useState(null)

  // Restore existing session if present
  useEffect(() => {
    const saved = localStorage.getItem('tempMail.session')
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.address && s.password && s.token) {
          setAddress(s.address)
          setPassword(s.password)
          setToken(s.token)
          setAccount(s.account || null)
        }
      } catch {}
    }
  }, [])

  // Fetch domains for optional manual selection later
  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const r = await fetch(`${baseUrl}/api/domains`)
        if (r.ok) {
          const d = await r.json()
          setDomains(d.domains || [])
        }
      } catch (e) {
        console.warn('Failed to fetch domains', e)
      }
    }
    fetchDomains()
  }, [baseUrl])

  // Persist session
  useEffect(() => {
    if (address && token) {
      localStorage.setItem('tempMail.session', JSON.stringify({ address, password, token, account }))
    }
  }, [address, password, token, account])

  // Poll for new messages
  useEffect(() => {
    if (!token) return
    let active = true
    const poll = async () => {
      await refreshMessages()
    }
    const id = setInterval(poll, 10000)
    // Initial immediate fetch
    poll()
    return () => {
      active = false
      clearInterval(id)
    }
  }, [token])

  const createNewMailbox = async () => {
    setLoading(true)
    setError('')
    setSelected(null)
    try {
      const r = await fetch(`${baseUrl}/api/temp-mail/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setAddress(data.address)
      setPassword(data.password)
      setToken(data.token)
      setAccount(data.account)
      setMessages([])
    } catch (e) {
      setError(typeof e === 'string' ? e : (e?.message || 'Failed to create mailbox'))
    } finally {
      setLoading(false)
    }
  }

  const refreshMessages = async () => {
    if (!token) return
    setMessagesLoading(true)
    try {
      const r = await fetch(`${baseUrl}/api/temp-mail/messages?token=${encodeURIComponent(token)}`)
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      const list = data['hydra:member'] || []
      setMessages(list)
      // If selected message disappeared, clear selection
      if (selected && !list.find(m => m.id === selected.id)) setSelected(null)
    } catch (e) {
      console.error(e)
    } finally {
      setMessagesLoading(false)
    }
  }

  const openMessage = async (msg) => {
    setSelected({ ...msg, loading: true })
    try {
      const r = await fetch(`${baseUrl}/api/temp-mail/messages/${msg.id}?token=${encodeURIComponent(token)}`)
      if (!r.ok) throw new Error(await r.text())
      const full = await r.json()
      setSelected(full)
    } catch (e) {
      setSelected({ ...msg, error: e?.message || 'Failed to load message' })
    }
  }

  const clearSession = () => {
    localStorage.removeItem('tempMail.session')
    setAddress('')
    setPassword('')
    setToken('')
    setAccount(null)
    setMessages([])
    setSelected(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-sky-50">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">TM</div>
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Temp Mail</h1>
              <p className="text-xs text-gray-500">Disposable inbox powered by mail.tm</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/test" className="text-sm text-gray-600 hover:text-gray-900">Health</a>
            <a href="https://mail.tm/en/" target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">mail.tm</a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero / Actions */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-800">Your disposable mailbox</h2>
              <p className="text-gray-500 text-sm">Create an inbox, receive emails, and keep your real address private.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={createNewMailbox} disabled={loading} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg shadow">
                {loading ? <Spinner size="5" /> : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.94 6.34A2 2 0 014 6h12a2 2 0 011.06.34L10 11 2.94 6.34z" /><path d="M18 8.12l-8 5-8-5V14a2 2 0 002 2h12a2 2 0 002-2V8.12z"/></svg>
                )}
                {address ? 'Regenerate' : 'Create inbox'}
              </button>
              {address && (
                <button onClick={clearSession} className="text-gray-700 hover:text-red-600 text-sm px-3 py-2 border border-gray-300 rounded-lg">Clear</button>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{error}</div>
          )}

          {address ? (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <span className="text-gray-500 text-sm">Address</span>
                  <span className="font-mono text-gray-900 text-sm md:text-base">{address}</span>
                  <CopyButton text={address} />
                </div>
              </div>
              <div className="">
                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <span className="text-gray-500 text-sm">Password</span>
                  <span className="font-mono text-gray-900 truncate">{password}</span>
                  <CopyButton text={password} />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-gray-500 text-sm">Click "Create inbox" to generate a new temporary email address.</div>
          )}
        </div>

        {/* Inbox */}
        {token && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Inbox</h3>
                <button onClick={refreshMessages} className="text-sm text-blue-600 hover:underline">Refresh</button>
              </div>
              <div className="max-h-[520px] overflow-auto divide-y">
                {messagesLoading && messages.length === 0 ? (
                  <div className="p-6 flex items-center gap-3 text-gray-500"><Spinner /> <span>Loading messages…</span></div>
                ) : messages.length === 0 ? (
                  <div className="p-6 text-gray-500">No messages yet. Send an email to this address to see it here.</div>
                ) : messages.map((m) => (
                  <button key={m.id} onClick={() => openMessage(m)} className={`w-full text-left p-4 hover:bg-gray-50 ${selected?.id === m.id ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-800 truncate">{m.from?.name || m.from?.address || 'Unknown sender'}</div>
                      <div className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleTimeString()}</div>
                    </div>
                    <div className="text-sm text-gray-700 truncate">{m.subject || '(no subject)'}</div>
                    {m.intro && <div className="text-xs text-gray-500 truncate">{m.intro}</div>}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl min-h-[520px]">
              {!selected ? (
                <div className="h-full flex items-center justify-center text-gray-500 p-6">Select a message to read</div>
              ) : selected.loading ? (
                <div className="h-full flex items-center justify-center text-gray-500 p-6"><Spinner /> Loading…</div>
              ) : selected.error ? (
                <div className="p-6 text-red-600">{selected.error}</div>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="p-5 border-b border-gray-200">
                    <div className="text-xs text-gray-500">From</div>
                    <div className="text-gray-800">{selected.from?.name || selected.from?.address}</div>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <div className="text-xs text-gray-500">To</div>
                      {Array.isArray(selected.to) ? selected.to.map((t, i) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{t.address}</span>
                      )) : null}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-gray-900">{selected.subject || '(no subject)'}</div>
                    <div className="mt-1 text-xs text-gray-500">{new Date(selected.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="p-5 overflow-auto flex-1">
                    {selected.html && selected.html.length > 0 ? (
                      <iframe title="email" className="w-full h-[420px] border rounded" srcDoc={selected.html.join('')}></iframe>
                    ) : selected.text ? (
                      <pre className="whitespace-pre-wrap text-sm text-gray-800">{selected.text}</pre>
                    ) : (
                      <div className="text-gray-500">No content</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="py-8 text-center text-xs text-gray-500">Built with ❤️ using the mail.tm API</footer>
    </div>
  )
}

export default App
