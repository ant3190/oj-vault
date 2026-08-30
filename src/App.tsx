import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { emptyState, loadState, saveState, type VaultState } from './data'
import type { Account, Collection, Page, Platform, Problem } from './types'

const platforms: Record<Platform, { name: string; short: string; color: string; hint: string }> = {
  luogu: { name: '洛谷', short: 'LG', color: '#35a46b', hint: 'UID 或用户名' },
  codeforces: { name: 'Codeforces', short: 'CF', color: '#4f8edb', hint: 'Handle' },
  qoj: { name: 'QOJ', short: 'Q', color: '#9b7bea', hint: '用户名' },
  uoj: { name: 'Universal OJ', short: 'U', color: '#e89254', hint: '用户名' },
  atcoder: { name: 'AtCoder', short: 'AT', color: '#8b929e', hint: '用户名' },
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function openAccountsCommand(accounts: Account[]) {
  const url = new URL('https://github.com/ant3190/oj-vault/issues/new')
  const cleanAccounts = accounts.map(({ id, platform, username, enabled }) => ({ id, platform, username, enabled }))
  const summary = cleanAccounts.length
    ? cleanAccounts.map((account) => `- ${platforms[account.platform].name}：${account.username}${account.enabled ? '' : '（暂停）'}`).join('\n')
    : '- 清空全部账号'
  url.searchParams.set('title', '[OJ Vault] 更新 OJ 账号配置')
  url.searchParams.set('body', `此 Issue 由 OJ Vault 账号管理页面生成。提交后，GitHub Actions 会一次性保存全部账号、开始同步并自动关闭此 Issue。\n\n${summary}\n\n<!-- OJ_VAULT_ACCOUNT ${JSON.stringify({ action: 'replace', accounts: cleanAccounts })} -->`)
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return <span className="icon" style={{ width: size, height: size }}>{children}</span>
}

const navItems: Array<{ id: Page; label: string; icon: ReactNode }> = [
  { id: 'problems', label: '题目', icon: <Icon>◇</Icon> },
  { id: 'collections', label: '归类', icon: <Icon>▤</Icon> },
  { id: 'accounts', label: 'OJ 账号', icon: <Icon>◎</Icon> },
]

export default function App() {
  const [state, setState] = useState<VaultState>(emptyState)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<Page>('problems')
  const [selectedProblem, setSelectedProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [accountsDirty, setAccountsDirty] = useState(false)

  useEffect(() => {
    loadState().then((next) => {
      setState(next)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (ready) saveState(state)
  }, [state, ready])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])

  const updateProblem = (problem: Problem) => {
    setState((current) => ({
      ...current,
      problems: current.problems.map((item) => item.id === problem.id ? problem : item),
    }))
  }

  const selected = state.problems.find((problem) => problem.id === selectedProblem)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage('problems')} aria-label="返回题目列表">
          <span className="brand-mark">V</span>
          <span><b>OJ Vault</b><small>个人算法题库</small></span>
        </button>

        <nav className="main-nav" aria-label="主导航">
          {navItems.map((item) => (
            <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}>
              {item.icon}<span>{item.label}</span>
              {item.id === 'problems' && <em>{state.problems.length}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-summary">
          <div><span>已通过</span><strong>{state.problems.filter((item) => item.accepted).length}</strong></div>
          <div><span>已收藏</span><strong>{state.problems.filter((item) => item.favorite).length}</strong></div>
        </div>
      </aside>

      <main className="main-content">
        {!ready ? <Loading /> : page === 'problems' ? (
          <ProblemsPage
            state={state}
            setState={setState}
            openProblem={setSelectedProblem}
            openAccounts={() => setPage('accounts')}
            notify={setNotice}
          />
        ) : page === 'collections' ? (
          <CollectionsPage state={state} setState={setState} openProblem={(id) => { setSelectedProblem(id); setPage('problems') }} />
        ) : (
          <AccountsPage state={state} setState={setState} notify={setNotice} dirty={accountsDirty} setDirty={setAccountsDirty} />
        )}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.map((item) => (
          <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}>
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>

      {selected && <ProblemDrawer problem={selected} collections={state.collections} onChange={updateProblem} onClose={() => setSelectedProblem(null)} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

function Loading() {
  return <div className="loading"><span /><p>正在打开题库…</p></div>
}

function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <header className="page-header"><div><small>{eyebrow}</small><h1>{title}</h1></div>{action}</header>
}

function ProblemsPage({ state, setState, openProblem, openAccounts, notify }: {
  state: VaultState
  setState: React.Dispatch<React.SetStateAction<VaultState>>
  openProblem: (id: string) => void
  openAccounts: () => void
  notify: (text: string) => void
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'accepted' | 'unsolved' | 'favorite'>('all')
  const [platform, setPlatform] = useState<'all' | Platform>('all')
  const [showAdd, setShowAdd] = useState(false)

  const filtered = useMemo(() => state.problems.filter((problem) => {
    const text = `${problem.title} ${problem.problemId} ${problem.tags.join(' ')}`.toLowerCase()
    if (query && !text.includes(query.toLowerCase())) return false
    if (platform !== 'all' && problem.platform !== platform) return false
    if (status === 'accepted' && !problem.accepted) return false
    if (status === 'unsolved' && problem.accepted) return false
    if (status === 'favorite' && !problem.favorite) return false
    return true
  }), [state.problems, query, status, platform])

  const addProblem = (problem: Problem) => {
    setState((current) => ({ ...current, problems: [problem, ...current.problems] }))
    setShowAdd(false)
    notify('题目已加入 OJ Vault')
  }

  return <>
    <PageHeader eyebrow="PROBLEM LIBRARY" title="我的题目" action={<button className="primary-button" onClick={() => setShowAdd(true)}>＋ 添加题目</button>} />

    <section className="toolbar">
      <label className="search-box">
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目、题号或标签" />
      </label>
      <select value={platform} onChange={(event) => setPlatform(event.target.value as 'all' | Platform)} aria-label="选择平台">
        <option value="all">全部平台</option>
        {Object.entries(platforms).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
      </select>
    </section>

    <div className="filter-row">
      {([['all', '全部'], ['accepted', '已通过'], ['unsolved', '未通过'], ['favorite', '收藏']] as const).map(([id, label]) => (
        <button key={id} className={status === id ? 'active' : ''} onClick={() => setStatus(id)}>{label}</button>
      ))}
      <span>{filtered.length} 道题</span>
    </div>

    {state.problems.length === 0 ? <EmptyProblems openAccounts={openAccounts} add={() => setShowAdd(true)} /> : (
      <section className="problem-table-wrap">
        <table className="problem-table">
          <thead><tr><th>题目</th><th>难度</th><th>标签</th><th>归类</th><th>状态</th><th aria-label="收藏" /></tr></thead>
          <tbody>{filtered.map((problem) => (
            <tr key={problem.id} onClick={() => openProblem(problem.id)}>
              <td><span className="platform-dot" style={{ background: platforms[problem.platform].color }}>{platforms[problem.platform].short}</span><div><strong>{problem.title}</strong><small>{problem.problemId}</small></div></td>
              <td><span className="difficulty">{problem.difficulty || '—'}</span></td>
              <td><div className="tag-list">{problem.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{problem.tags.length === 0 && <i>—</i>}</div></td>
              <td>{problem.collections[0] || <i>未归类</i>}</td>
              <td><span className={`status-pill ${problem.accepted ? 'accepted' : ''}`}>{problem.accepted ? '已通过' : '未通过'}</span></td>
              <td><button className={`star ${problem.favorite ? 'active' : ''}`} onClick={(event) => {
                event.stopPropagation()
                setState((current) => ({ ...current, problems: current.problems.map((item) => item.id === problem.id ? { ...item, favorite: !item.favorite } : item) }))
              }} aria-label={problem.favorite ? '取消收藏' : '收藏'}>{problem.favorite ? '★' : '☆'}</button></td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 && <div className="no-results">没有符合条件的题目</div>}
      </section>
    )}
    {showAdd && <AddProblemModal onClose={() => setShowAdd(false)} onAdd={addProblem} />}
  </>
}

function EmptyProblems({ openAccounts, add }: { openAccounts: () => void; add: () => void }) {
  return <section className="empty-state">
    <div className="empty-glyph">◇</div>
    <h2>题库还是空的</h2>
    <p>绑定 OJ 账号后同步做过的题目，或者先手动添加一道题。</p>
    <div><button className="primary-button" onClick={openAccounts}>绑定 OJ 账号</button><button className="secondary-button" onClick={add}>手动添加</button></div>
  </section>
}

function AddProblemModal({ onClose, onAdd }: { onClose: () => void; onAdd: (problem: Problem) => void }) {
  const [platform, setPlatform] = useState<Platform>('luogu')
  const [problemId, setProblemId] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onAdd({ id: `${platform}-${problemId || uid('problem')}`, platform, problemId, title, url, difficulty: '', tags: [], favorite: false, collections: [], accepted: false, solution: '' })
  }

  return <Modal title="添加题目" onClose={onClose}>
    <form onSubmit={submit} className="stack-form">
      <label>平台<select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>{Object.entries(platforms).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
      <div className="form-grid"><label>题号<input required value={problemId} onChange={(event) => setProblemId(event.target.value)} placeholder="例如 P1001" /></label><label>题目名称<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label></div>
      <label>原题链接<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button">添加</button></div>
    </form>
  </Modal>
}

function ProblemDrawer({ problem, collections, onChange, onClose }: { problem: Problem; collections: Collection[]; onChange: (problem: Problem) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(problem)
  const [tagText, setTagText] = useState(problem.tags.join(', '))

  const patch = <K extends keyof Problem>(key: K, value: Problem[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = () => {
    onChange({ ...draft, tags: tagText.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })
    onClose()
  }

  return <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={problem.title}>
    <button className="drawer-backdrop" onClick={onClose} aria-label="关闭" />
    <aside className="problem-drawer">
      <header><div><span className="platform-dot" style={{ background: platforms[problem.platform].color }}>{platforms[problem.platform].short}</span><small>{platforms[problem.platform].name} · {problem.problemId}</small></div><button onClick={onClose} aria-label="关闭">×</button></header>
      <div className="drawer-body">
        <div className="problem-title"><div><h2>{problem.title}</h2><a href={problem.url} target="_blank" rel="noreferrer">打开原题 ↗</a></div><button className={`star large ${draft.favorite ? 'active' : ''}`} onClick={() => patch('favorite', !draft.favorite)}>{draft.favorite ? '★' : '☆'}</button></div>
        <div className="field-grid"><label>难度<input value={draft.difficulty} onChange={(event) => patch('difficulty', event.target.value)} placeholder="未设置" /></label><label>状态<select value={draft.accepted ? 'yes' : 'no'} onChange={(event) => patch('accepted', event.target.value === 'yes')}><option value="yes">已通过</option><option value="no">未通过</option></select></label></div>
        <label className="field">标签<input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="使用逗号分隔" /></label>
        <fieldset className="collection-picker"><legend>归类</legend>{collections.length === 0 ? <p>还没有归类</p> : collections.map((collection) => <label key={collection.id}><input type="checkbox" checked={draft.collections.includes(collection.id)} onChange={(event) => patch('collections', event.target.checked ? [...draft.collections, collection.id] : draft.collections.filter((id) => id !== collection.id))} />{collection.name}</label>)}</fieldset>
        <section className="solution-editor"><div className="section-title"><h3>题解</h3><span>Markdown</span></div><textarea value={draft.solution} onChange={(event) => patch('solution', event.target.value)} placeholder={'写下解题思路、复杂度和代码…\n\n```cpp\n// solution\n```'} /><div className="preview"><small>预览</small><MarkdownPreview source={draft.solution} /></div></section>
      </div>
      <footer><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}>保存修改</button></footer>
    </aside>
  </div>
}

function MarkdownPreview({ source }: { source: string }) {
  if (!source.trim()) return <p className="preview-empty">题解预览会显示在这里</p>
  const blocks: ReactNode[] = []
  let inCode = false
  let code: string[] = []
  source.split('\n').forEach((line, index) => {
    if (line.startsWith('```')) {
      if (inCode) { blocks.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>); code = [] }
      inCode = !inCode
    } else if (inCode) code.push(line)
    else if (line.startsWith('### ')) blocks.push(<h4 key={index}>{line.slice(4)}</h4>)
    else if (line.startsWith('## ')) blocks.push(<h3 key={index}>{line.slice(3)}</h3>)
    else if (line.startsWith('# ')) blocks.push(<h2 key={index}>{line.slice(2)}</h2>)
    else if (line.startsWith('- ')) blocks.push(<div className="md-list" key={index}>• {line.slice(2)}</div>)
    else if (line.trim()) blocks.push(<p key={index}>{line}</p>)
    else blocks.push(<br key={index} />)
  })
  if (code.length) blocks.push(<pre key="code-last"><code>{code.join('\n')}</code></pre>)
  return <div className="markdown">{blocks}</div>
}

function CollectionsPage({ state, setState, openProblem }: { state: VaultState; setState: React.Dispatch<React.SetStateAction<VaultState>>; openProblem: (id: string) => void }) {
  const [name, setName] = useState('')
  const [active, setActive] = useState<string | null>(state.collections[0]?.id || null)
  const selected = state.collections.find((item) => item.id === active)
  const problems = state.problems.filter((problem) => active && problem.collections.includes(active))

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    const collection = { id: uid('collection'), name: name.trim() }
    setState((current) => ({ ...current, collections: [...current.collections, collection] }))
    setActive(collection.id)
    setName('')
  }

  const remove = (id: string) => {
    if (!window.confirm('删除这个归类？归类中的题目不会被删除。')) return
    setState((current) => ({
      ...current,
      collections: current.collections.filter((item) => item.id !== id),
      problems: current.problems.map((problem) => ({ ...problem, collections: problem.collections.filter((collection) => collection !== id) })),
    }))
    setActive(null)
  }

  return <>
    <PageHeader eyebrow="COLLECTIONS" title="题目归类" />
    <div className="collections-layout">
      <section className="collection-list">
        <form onSubmit={add}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="新归类名称" /><button aria-label="新建归类">＋</button></form>
        {state.collections.map((collection) => <button key={collection.id} className={active === collection.id ? 'active' : ''} onClick={() => setActive(collection.id)}><span>▤</span><strong>{collection.name}</strong><em>{state.problems.filter((problem) => problem.collections.includes(collection.id)).length}</em></button>)}
        {state.collections.length === 0 && <div className="mini-empty"><span>▤</span><p>新建一个归类，把题目整理在一起。</p></div>}
      </section>
      <section className="collection-detail">
        {!selected ? <div className="center-empty">选择或新建一个归类</div> : <>
          <header><div><small>COLLECTION</small><h2>{selected.name}</h2><p>{problems.length} 道题目</p></div><button className="danger-link" onClick={() => remove(selected.id)}>删除归类</button></header>
          <div className="collection-problems">{problems.map((problem) => <button key={problem.id} onClick={() => openProblem(problem.id)}><span className="platform-dot" style={{ background: platforms[problem.platform].color }}>{platforms[problem.platform].short}</span><div><strong>{problem.title}</strong><small>{problem.problemId}</small></div><span className={`status-pill ${problem.accepted ? 'accepted' : ''}`}>{problem.accepted ? '已通过' : '未通过'}</span></button>)}{problems.length === 0 && <div className="center-empty">这个归类中还没有题目</div>}</div>
        </>}
      </section>
    </div>
  </>
}

function AccountsPage({ state, setState, notify, dirty, setDirty }: { state: VaultState; setState: React.Dispatch<React.SetStateAction<VaultState>>; notify: (text: string) => void; dirty: boolean; setDirty: (dirty: boolean) => void }) {
  const [binding, setBinding] = useState<Platform | null>(null)
  const [username, setUsername] = useState('')

  const bind = (event: FormEvent) => {
    event.preventDefault()
    if (!binding || !username.trim()) return
    if (state.accounts.some((account) => account.platform === binding && account.username.toLowerCase() === username.trim().toLowerCase())) {
      notify('这个账号已经绑定')
      return
    }
    const account = { id: uid(binding), platform: binding, username: username.trim(), enabled: true, syncState: 'idle' as const }
    setState((current) => ({ ...current, accounts: [...current.accounts, account] }))
    setDirty(true)
    setUsername('')
    setBinding(null)
    notify('账号已添加，完成后点击保存并同步')
  }

  const toggle = (account: Account) => {
    setState((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === account.id ? { ...item, enabled: !item.enabled } : item) }))
    setDirty(true)
    notify('账号状态已修改，记得保存并同步')
  }
  const remove = (account: Account) => {
    if (!window.confirm('解绑这个账号？已经导入的题目不会删除。')) return
    setState((current) => ({ ...current, accounts: current.accounts.filter((item) => item.id !== account.id) }))
    setDirty(true)
    notify('账号已移除，记得保存并同步')
  }

  const sync = async (account: Account) => {
    if (account.platform !== 'codeforces') {
      window.open('https://github.com/ant3190/oj-vault/actions/workflows/sync.yml', '_blank', 'noopener,noreferrer')
      notify('请在 GitHub Actions 中点击 Run workflow')
      return
    }
    setState((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === account.id ? { ...item, syncState: 'syncing' } : item) }))
    try {
      const response = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(account.username)}&from=1&count=10000`)
      const payload = await response.json()
      if (payload.status !== 'OK') throw new Error(payload.comment)
      const accepted = new Map<string, Problem>()
      for (const submission of payload.result) {
        if (submission.verdict !== 'OK') continue
        const contestId = submission.problem.contestId
        const index = submission.problem.index
        const key = `codeforces-${contestId}-${index}`
        accepted.set(key, {
          id: key,
          platform: 'codeforces',
          problemId: `${contestId}${index}`,
          title: submission.problem.name,
          url: `https://codeforces.com/problemset/problem/${contestId}/${index}`,
          difficulty: submission.problem.rating?.toString() || '',
          tags: submission.problem.tags || [],
          favorite: false,
          collections: [],
          accepted: true,
          solution: '',
        })
      }
      setState((current) => {
        const merged = new Map(current.problems.map((problem) => [problem.id, problem]))
        accepted.forEach((problem, id) => {
          const old = merged.get(id)
          merged.set(id, old ? { ...problem, favorite: old.favorite, collections: old.collections, solution: old.solution, tags: old.tags.length ? old.tags : problem.tags } : problem)
        })
        return { ...current, problems: [...merged.values()], accounts: current.accounts.map((item) => item.id === account.id ? { ...item, syncState: 'success', lastSync: new Date().toISOString() } : item) }
      })
      notify(`已同步 ${accepted.size} 道 Codeforces 题目`)
    } catch {
      setState((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === account.id ? { ...item, syncState: 'error' } : item) }))
      notify('同步失败，请检查账号名称或稍后重试')
    }
  }

  const saveAccounts = () => {
    openAccountsCommand(state.accounts)
    notify('请在 GitHub 页面确认一次，之后会自动同步')
  }

  return <>
    <PageHeader eyebrow="CONNECTED ACCOUNTS" title="OJ 账号" action={<button className={`primary-button save-accounts ${dirty ? '' : 'saved'}`} onClick={saveAccounts} disabled={!dirty}>{dirty ? '保存并同步' : '已保存'}</button>} />
    <p className="page-intro">同一个 OJ 可以绑定多个账号。同步结果会合并到同一份题库，重复题目只保留一份。</p>
    <div className="account-grid">{(Object.keys(platforms) as Platform[]).map((platform) => {
      const meta = platforms[platform]
      const accounts = state.accounts.filter((account) => account.platform === platform)
      return <section className="account-card" key={platform}>
        <header><span className="platform-logo" style={{ background: `${meta.color}18`, color: meta.color }}>{meta.short}</span><div><h2>{meta.name}</h2><p>{accounts.length ? `${accounts.length} 个账号` : '尚未绑定'}</p></div><button onClick={() => { setBinding(platform); setUsername('') }} aria-label={`绑定 ${meta.name} 账号`}>＋</button></header>
        <div className="account-list">{accounts.map((account) => <div className="account-row" key={account.id}><span className={`sync-light ${account.syncState || 'idle'}`} /><div><strong>{account.username}</strong><small>{account.syncState === 'syncing' ? '正在同步…' : account.syncState === 'error' ? '上次同步失败' : account.lastSync ? `上次同步 ${new Date(account.lastSync).toLocaleDateString()}` : account.enabled ? '已启用' : '已暂停'}</small></div><button className="sync-button" disabled={!account.enabled || account.syncState === 'syncing'} onClick={() => sync(account)}>同步</button><label className="switch" title={account.enabled ? '暂停同步' : '启用同步'}><input type="checkbox" checked={account.enabled} onChange={() => toggle(account)} /><span /></label><button className="row-remove" onClick={() => remove(account)} aria-label="解绑账号">×</button></div>)}{accounts.length === 0 && <button className="bind-empty" onClick={() => setBinding(platform)}>＋ 绑定账号</button>}</div>
      </section>
    })}</div>
    {binding && <Modal title={`绑定 ${platforms[binding].name}`} onClose={() => setBinding(null)}><form className="stack-form" onSubmit={bind}><label>{platforms[binding].hint}<input autoFocus required value={username} onChange={(event) => setUsername(event.target.value)} placeholder={platforms[binding].hint} /></label><p className="form-note">只需要公开用户名，不要输入密码或 Cookie。同一平台可以添加多个账号。全部修改完成后，再统一保存一次。</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setBinding(null)}>取消</button><button className="primary-button">添加</button></div></form></Modal>}
  </>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-layer" role="dialog" aria-modal="true"><button className="modal-backdrop" onClick={onClose} aria-label="关闭" /><section className="modal"><header><h2>{title}</h2><button onClick={onClose} aria-label="关闭">×</button></header>{children}</section></div>
}
