import { CSSProperties, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { clearAdminToken, emptyState, getAdminToken, loadState, mergeSyncedState, saveAccountsAndSync, saveAdminToken, saveState, type VaultState } from './data'
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

function problemKey(platform: Platform, rawProblemId: string) {
  const problemId = rawProblemId.trim()
  if (platform === 'codeforces') {
    const match = problemId.match(/^(\d+)[-\s]?([A-Za-z]\d*)$/)
    if (match) return `codeforces-${match[1]}-${match[2].toUpperCase()}`
  }
  if (platform === 'luogu') return `luogu-${problemId.toUpperCase()}`
  if (platform === 'atcoder') return `atcoder-${problemId.toLowerCase()}`
  return `${platform}-${problemId}`
}

function activityTime(problem: Problem) {
  const value = problem.activityAt || problem.acceptedAt
  return value ? Date.parse(value) : Number.NEGATIVE_INFINITY
}

function newestFirst(left: Problem, right: Problem) {
  const difference = activityTime(right) - activityTime(left)
  return difference || left.id.localeCompare(right.id)
}

type IconName = 'library' | 'folder' | 'users' | 'plus' | 'search' | 'star' | 'check' | 'clock' | 'external' | 'close' | 'sync' | 'trash' | 'chevron' | 'key' | 'edit'

function UiIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    library: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16" /><path d="M8 7h8" /></>,
    folder: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    star: <><path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9z" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    external: <><path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    sync: <><path d="M20 7h-5V2" /><path d="M4 17h5v5" /><path d="M5.1 9A8 8 0 0 1 18.7 5L20 7M4 17l1.3 2A8 8 0 0 0 18.9 15" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M15 8l3 3M17 6l3 3" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /></>,
  }
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const navItems: Array<{ id: Page; label: string; icon: IconName }> = [
  { id: 'problems', label: '题目', icon: 'library' },
  { id: 'collections', label: '归类', icon: 'folder' },
  { id: 'accounts', label: 'OJ 账号', icon: 'users' },
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
    setState((current) => {
      const previous = current.problems.find((item) => item.id === problem.id)
      const newlyAccepted = problem.accepted && !previous?.accepted
      const acceptedAt = new Date().toISOString()
      const next = newlyAccepted ? {
        ...problem,
        acceptedAt,
        activityAt: acceptedAt,
      } : problem
      return {
        ...current,
        problems: newlyAccepted
          ? [next, ...current.problems.filter((item) => item.id !== problem.id)]
          : current.problems.map((item) => item.id === problem.id ? next : item),
      }
    })
  }

  const selected = state.problems.find((problem) => problem.id === selectedProblem)
  const acceptedCount = state.problems.filter((item) => item.accepted).length
  const favoriteCount = state.problems.filter((item) => item.favorite).length

  const navigate = (next: Page) => {
    setPage(next)
    setSelectedProblem(null)
  }

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button className="mobile-brand" onClick={() => navigate('problems')} aria-label="返回题目列表">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>OJ Vault</span>
        </button>
        <span className="mobile-count">{state.problems.length} 题</span>
      </header>

      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('problems')} aria-label="返回题目列表">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span><b>OJ Vault</b><small>Algorithm workspace</small></span>
        </button>

        <nav className="main-nav" aria-label="主导航">
          {navItems.map((item) => (
            <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
              <UiIcon name={item.icon} /><span>{item.label}</span>
              {item.id === 'problems' && <em>{state.problems.length}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-summary">
          <p>题库概览</p>
          <div><span>已通过</span><strong>{acceptedCount}</strong></div>
          <div><span>已收藏</span><strong>{favoriteCount}</strong></div>
          <div><span>已连接账号</span><strong>{state.accounts.filter((item) => item.enabled).length}</strong></div>
        </div>
      </aside>

      <main className="main-content">
        <div className="content-frame">
          {!ready ? <Loading /> : page === 'problems' ? (
            <ProblemsPage
              state={state}
              setState={setState}
              openProblem={setSelectedProblem}
              openAccounts={() => navigate('accounts')}
              notify={setNotice}
            />
          ) : page === 'collections' ? (
            <CollectionsPage state={state} setState={setState} openProblem={(id) => { setSelectedProblem(id); setPage('problems') }} />
          ) : (
            <AccountsPage state={state} setState={setState} notify={setNotice} dirty={accountsDirty} setDirty={setAccountsDirty} />
          )}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.map((item) => (
          <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}>
            <UiIcon name={item.icon} /><span>{item.label}</span>
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

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div><small>{eyebrow}</small><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>
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
  const acceptedCount = state.problems.filter((problem) => problem.accepted).length
  const favoriteCount = state.problems.filter((problem) => problem.favorite).length

  const filtered = useMemo(() => state.problems.filter((problem) => {
    const text = `${problem.title} ${problem.problemId} ${problem.tags.join(' ')}`.toLowerCase()
    if (query && !text.includes(query.toLowerCase())) return false
    if (platform !== 'all' && problem.platform !== platform) return false
    if (status === 'accepted' && !problem.accepted) return false
    if (status === 'unsolved' && problem.accepted) return false
    if (status === 'favorite' && !problem.favorite) return false
    return true
  }).sort(newestFirst), [state.problems, query, status, platform])

  const addProblem = (problem: Problem) => {
    const activityAt = new Date().toISOString()
    setState((current) => {
      const existing = current.problems.find((item) => item.id === problem.id)
      const next = existing ? {
        ...problem,
        difficulty: existing.difficultyManual ? existing.difficulty : '',
        difficultyManual: existing.difficultyManual,
        tags: existing.tags,
        favorite: existing.favorite,
        collections: existing.collections,
        accepted: existing.accepted,
        acceptedAt: existing.acceptedAt,
        solution: existing.solution,
        activityAt,
      } : { ...problem, activityAt }
      return { ...current, problems: [next, ...current.problems.filter((item) => item.id !== problem.id)] }
    })
    setShowAdd(false)
    notify('题目已加入 OJ Vault')
  }

  return <>
    <PageHeader
      eyebrow="题目工作台"
      title="我的题库"
      description="按最近通过或加入时间排列"
      action={<button className="primary-button" onClick={() => setShowAdd(true)}><UiIcon name="plus" />添加题目</button>}
    />

    <section className="overview-strip" aria-label="题库概览">
      <button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}>
        <span>全部题目</span><strong>{state.problems.length}</strong><small>题库总量</small>
      </button>
      <button className={status === 'accepted' ? 'active' : ''} onClick={() => setStatus('accepted')}>
        <span>已经通过</span><strong>{acceptedCount}</strong><small>{state.problems.length ? `${Math.round(acceptedCount / state.problems.length * 100)}% 完成` : '等待同步'}</small>
      </button>
      <button className={status === 'favorite' ? 'active' : ''} onClick={() => setStatus('favorite')}>
        <span>重点收藏</span><strong>{favoriteCount}</strong><small>随时回看</small>
      </button>
    </section>

    <section className="toolbar" aria-label="筛选题目">
      <label className="search-box">
        <span className="visually-hidden">搜索题目</span>
        <UiIcon name="search" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目、题号或标签" />
      </label>
      <label className="select-box">
        <span className="visually-hidden">选择平台</span>
        <select value={platform} onChange={(event) => setPlatform(event.target.value as 'all' | Platform)}>
          <option value="all">全部平台</option>
          {Object.entries(platforms).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
        </select>
      </label>
    </section>

    <div className="filter-row">
      <div className="segmented-control" role="group" aria-label="题目状态">
        {([['all', '全部'], ['accepted', '已通过'], ['unsolved', '未通过'], ['favorite', '收藏']] as const).map(([id, label]) => (
          <button key={id} className={status === id ? 'active' : ''} onClick={() => setStatus(id)}>{label}</button>
        ))}
      </div>
      <span><UiIcon name="clock" size={15} />{filtered.length} 道 · 最近活动优先</span>
    </div>

    {state.problems.length === 0 ? <EmptyProblems openAccounts={openAccounts} add={() => setShowAdd(true)} /> : (
      <section className="problem-table-wrap">
        <table className="problem-table">
          <thead><tr><th>题目</th><th>标签</th><th aria-label="收藏" /></tr></thead>
          <tbody>{filtered.map((problem) => (
            <tr key={problem.id} onClick={() => openProblem(problem.id)}>
              <td><span className="platform-dot" style={{ '--platform': platforms[problem.platform].color } as CSSProperties}>{platforms[problem.platform].short}</span><button className="problem-open" onClick={(event) => { event.stopPropagation(); openProblem(problem.id) }}><strong>{problem.title || problem.problemId}</strong><small>{problem.problemId}{problem.acceptedAt ? ` · ${new Date(problem.acceptedAt).toLocaleDateString('zh-CN')}` : ''}</small></button></td>
              <td>{problem.tags.length ? <span className="tag-summary" title={problem.tags.join(' · ')}>{problem.tags.slice(0, 2).join(' · ')}{problem.tags.length > 2 ? ` · +${problem.tags.length - 2}` : ''}</span> : <i>暂无标签</i>}</td>
              <td><button className={`star ${problem.favorite ? 'active' : ''}`} onClick={(event) => {
                event.stopPropagation()
                setState((current) => ({ ...current, problems: current.problems.map((item) => item.id === problem.id ? { ...item, favorite: !item.favorite } : item) }))
              }} aria-label={problem.favorite ? '取消收藏' : '收藏'} aria-pressed={problem.favorite}><UiIcon name="star" /></button></td>
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
    <div className="empty-glyph"><UiIcon name="library" size={28} /></div>
    <h2>题库还是空的</h2>
    <p>绑定 OJ 账号后同步做过的题目，或者先手动添加一道题。</p>
    <div><button className="primary-button" onClick={openAccounts}><UiIcon name="users" />绑定 OJ 账号</button><button className="secondary-button" onClick={add}><UiIcon name="plus" />手动添加</button></div>
  </section>
}

function AddProblemModal({ onClose, onAdd }: { onClose: () => void; onAdd: (problem: Problem) => void }) {
  const [platform, setPlatform] = useState<Platform>('luogu')
  const [problemId, setProblemId] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onAdd({ id: problemKey(platform, problemId || uid('problem')), platform, problemId: problemId.trim(), title, url, difficulty: '', difficultyManual: false, tags: [], favorite: false, collections: [], accepted: false, solution: '' })
  }

  return <Modal title="添加题目" onClose={onClose}>
    <form onSubmit={submit} className="stack-form">
      <label>平台<select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>{Object.entries(platforms).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
      <div className="form-grid"><label>题号<input required value={problemId} onChange={(event) => setProblemId(event.target.value)} placeholder="例如 P1001" /></label><label>题目名称<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label></div>
      <label>原题链接<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button"><UiIcon name="plus" />添加题目</button></div>
    </form>
  </Modal>
}

function ProblemDrawer({ problem, collections, onChange, onClose }: { problem: Problem; collections: Collection[]; onChange: (problem: Problem) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(problem)
  const [tagText, setTagText] = useState(problem.tags.join(', '))
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    const focusTimer = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('.drawer-actions button')?.focus())
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [onClose])

  const patch = <K extends keyof Problem>(key: K, value: Problem[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const save = () => {
    onChange({ ...draft, tags: tagText.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })
    onClose()
  }

  return <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={problem.title}>
    <button className="drawer-backdrop" onClick={onClose} aria-label="关闭" />
    <aside className="problem-drawer" ref={panelRef}>
      <header>
        <div className="drawer-context">
          <span className="platform-dot" style={{ '--platform': platforms[problem.platform].color } as CSSProperties}>{platforms[problem.platform].short}</span>
          <div><strong>{platforms[problem.platform].name}</strong><small>{problem.problemId}</small></div>
        </div>
        <div className="drawer-actions">
          <a className="icon-button" href={problem.url} target="_blank" rel="noreferrer" aria-label="打开原题"><UiIcon name="external" /></a>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><UiIcon name="close" /></button>
        </div>
      </header>
      <div className="drawer-body">
        <div className="problem-title">
          <div><span className="problem-kicker">题目详情</span><h2>{problem.title || problem.problemId}</h2></div>
          <button className={`favorite-button ${draft.favorite ? 'active' : ''}`} onClick={() => patch('favorite', !draft.favorite)} aria-pressed={draft.favorite}>
            <UiIcon name="star" />{draft.favorite ? '已收藏' : '收藏'}
          </button>
        </div>

        <section className="detail-fields" aria-label="题目信息">
          <label className="field field-first">状态<select value={draft.accepted ? 'yes' : 'no'} onChange={(event) => patch('accepted', event.target.value === 'yes')}><option value="yes">已通过</option><option value="no">未通过</option></select></label>
          <label className="field">标签<input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="例如：字符串，后缀数组，LCP" /></label>
        </section>

        <fieldset className="collection-picker">
          <legend>加入归类</legend>
          {collections.length === 0 ? <p>还没有归类，可在“归类”页面新建。</p> : collections.map((collection) => <label key={collection.id}><input type="checkbox" checked={draft.collections.includes(collection.id)} onChange={(event) => patch('collections', event.target.checked ? [...draft.collections, collection.id] : draft.collections.filter((id) => id !== collection.id))} /><span>{collection.name}</span></label>)}
        </fieldset>

        <section className="solution-editor">
          <div className="section-title"><div><UiIcon name="edit" /><h3>题解笔记</h3></div><span>Markdown</span></div>
          <div className="editor-grid">
            <label className="editor-panel"><span>编辑</span><textarea value={draft.solution} onChange={(event) => patch('solution', event.target.value)} placeholder={'写下解题思路、复杂度和代码…\n\n```cpp\n// solution\n```'} /></label>
            <div className="preview"><span>预览</span><MarkdownPreview source={draft.solution} /></div>
          </div>
        </section>
      </div>
      <footer><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}><UiIcon name="check" />保存修改</button></footer>
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
    <PageHeader eyebrow="知识整理" title="题目归类" description="按专题、训练计划或复习阶段组织题目" />
    <div className="collections-layout">
      <section className="collection-list">
        <form onSubmit={add}><label className="visually-hidden" htmlFor="new-collection">新归类名称</label><input id="new-collection" value={name} onChange={(event) => setName(event.target.value)} placeholder="新归类名称" /><button aria-label="新建归类"><UiIcon name="plus" /></button></form>
        <div className="collection-nav">
          {state.collections.map((collection) => <button key={collection.id} className={active === collection.id ? 'active' : ''} onClick={() => setActive(collection.id)}><UiIcon name="folder" /><span><strong>{collection.name}</strong><small>{state.problems.filter((problem) => problem.collections.includes(collection.id)).length} 道题</small></span><UiIcon name="chevron" size={16} /></button>)}
        </div>
        {state.collections.length === 0 && <div className="mini-empty"><UiIcon name="folder" size={26} /><p>新建一个归类，把相关题目放在一起。</p></div>}
      </section>
      <section className="collection-detail">
        {!selected ? <div className="center-empty">选择或新建一个归类</div> : <>
          <header><div><small>当前归类</small><h2>{selected.name}</h2><p>{problems.length} 道题目</p></div><button className="danger-link" onClick={() => remove(selected.id)}><UiIcon name="trash" />删除归类</button></header>
          <div className="collection-problems">{problems.map((problem) => <button key={problem.id} onClick={() => openProblem(problem.id)}><span className="platform-dot" style={{ '--platform': platforms[problem.platform].color } as CSSProperties}>{platforms[problem.platform].short}</span><div><strong>{problem.title || problem.problemId}</strong><small>{problem.problemId}</small></div><span className={`status-text ${problem.accepted ? 'accepted' : ''}`}>{problem.accepted && <UiIcon name="check" size={13} />}{problem.accepted ? '已通过' : '未通过'}</span><UiIcon name="chevron" size={16} /></button>)}{problems.length === 0 && <div className="center-empty"><span>这个归类中还没有题目</span><small>在题目详情里即可加入归类</small></div>}</div>
        </>}
      </section>
    </div>
  </>
}

function AccountsPage({ state, setState, notify, dirty, setDirty }: { state: VaultState; setState: React.Dispatch<React.SetStateAction<VaultState>>; notify: (text: string) => void; dirty: boolean; setDirty: (dirty: boolean) => void }) {
  const [binding, setBinding] = useState<Platform | null>(null)
  const [username, setUsername] = useState('')
  const [tokenOpen, setTokenOpen] = useState(false)
  const [token, setToken] = useState('')
  const [syncing, setSyncing] = useState(false)

  const openBinding = (platform: Platform) => {
    setUsername('')
    setBinding(platform)
  }
  const closeBinding = () => {
    setBinding(null)
    setUsername('')
  }

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
    closeBinding()
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

  const runSync = async (adminToken: string) => {
    if (!adminToken) {
      setTokenOpen(true)
      return
    }
    setSyncing(true)
    setState((current) => ({ ...current, accounts: current.accounts.map((item) => item.enabled ? { ...item, syncState: 'syncing' } : item) }))
    try {
      const result = await saveAccountsAndSync(state.accounts, adminToken)
      saveAdminToken(adminToken)
      const merged = mergeSyncedState(state, result.remote)
      setState((current) => mergeSyncedState(current, result.remote))
      setDirty(false)
      notify(`同步完成，题库现有 ${merged.problems.length} 道题`)
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        clearAdminToken()
        setToken('')
        setTokenOpen(true)
        notify('管理密钥不正确，请重新输入')
      } else {
        setState((current) => ({ ...current, accounts: current.accounts.map((item) => item.enabled ? { ...item, syncState: 'error' } : item) }))
        notify(error instanceof Error ? error.message : '同步失败，请稍后重试')
      }
    } finally {
      setSyncing(false)
    }
  }

  const saveAccounts = () => runSync(getAdminToken())

  const connect = (event: FormEvent) => {
    event.preventDefault()
    const value = token.trim()
    if (!value) return
    setTokenOpen(false)
    void runSync(value)
  }

  return <>
    <PageHeader
      eyebrow="数据来源"
      title="OJ 账号"
      description="统一管理公开账号与同步状态"
      action={<button className="primary-button save-accounts" onClick={saveAccounts} disabled={syncing}><UiIcon name="sync" />{syncing ? '正在同步…' : dirty ? '保存并同步' : '立即同步'}</button>}
    />
    <section className="sync-summary">
      <div className="sync-summary-icon"><UiIcon name="sync" /></div>
      <div><strong>每日自动同步已开启</strong><p>添加或修改账号后可立即同步；只读取平台允许公开访问的记录。</p></div>
      <span>{state.accounts.filter((account) => account.enabled).length} 个账号启用</span>
    </section>
    <div className="account-grid">{(Object.keys(platforms) as Platform[]).map((platform) => {
      const meta = platforms[platform]
      const accounts = state.accounts.filter((account) => account.platform === platform)
      return <section className="account-card" key={platform}>
        <header><span className="platform-logo" style={{ '--platform': meta.color } as CSSProperties}>{meta.short}</span><div><h2>{meta.name}</h2><p>{accounts.length ? `${accounts.length} 个账号` : '尚未绑定'}</p></div><button className="icon-button" onClick={() => openBinding(platform)} aria-label={`绑定 ${meta.name} 账号`}><UiIcon name="plus" /></button></header>
        <div className="account-list">{accounts.map((account) => <div className="account-row" key={account.id}><span className={`sync-light ${account.syncState || 'idle'}`} /><div className="account-copy"><strong>{account.username}</strong><small title={account.lastMessage}>{account.syncState === 'syncing' ? '正在同步…' : account.syncState === 'limited' ? account.lastMessage || '账号已绑定，公开同步受限' : account.syncState === 'error' ? account.lastMessage || '上次同步失败' : account.lastSync ? `上次同步 ${new Date(account.lastSync).toLocaleString('zh-CN')}` : account.enabled ? '等待首次同步' : '已暂停同步'}</small></div><label className="switch" title={account.enabled ? '暂停同步' : '启用同步'}><span className="visually-hidden">{account.enabled ? '暂停同步' : '启用同步'}</span><input type="checkbox" checked={account.enabled} onChange={() => toggle(account)} /><span /></label><button className="icon-button row-remove" onClick={() => remove(account)} aria-label="解绑账号"><UiIcon name="trash" size={17} /></button></div>)}{accounts.length === 0 && <button className="bind-empty" onClick={() => openBinding(platform)}><UiIcon name="plus" />绑定账号</button>}</div>
      </section>
    })}</div>
    {binding && <Modal title={`绑定 ${platforms[binding].name}`} onClose={closeBinding}><form className="stack-form" onSubmit={bind}><label htmlFor={`account-${binding}`}>{platforms[binding].name} 账号<input id={`account-${binding}`} name="oj-account-identifier" type="text" autoFocus required maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} placeholder={`输入${platforms[binding].hint}`} aria-describedby={`account-${binding}-note`} /></label><p className="form-note" id={`account-${binding}-note`}>{binding === 'qoj' ? '填写需要同步的 QOJ 用户名即可。同步服务通过独立读取账号获取公开题单，不会使用或保存你的 QOJ 密码。' : '只需要公开用户名，不要输入密码或 Cookie。同一平台可以添加多个账号。全部修改完成后，再统一保存一次。'}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={closeBinding}>取消</button><button className="primary-button" disabled={!username.trim()}><UiIcon name="plus" />添加账号</button></div></form></Modal>}
    {tokenOpen && <Modal title="连接同步服务" onClose={() => setTokenOpen(false)}><form className="stack-form" onSubmit={connect}><label>管理密钥<input type="password" autoFocus required value={token} onChange={(event) => setToken(event.target.value)} autoComplete="current-password" placeholder="首次使用时输入一次" /></label><p className="form-note">密钥只保存在当前浏览器，用于保护账号修改和同步操作；读取题库不需要密钥。</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setTokenOpen(false)}>取消</button><button className="primary-button"><UiIcon name="key" />连接并同步</button></div></form></Modal>}
  </>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const modalRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    const focusTimer = window.setTimeout(() => modalRef.current?.querySelector<HTMLElement>('.stack-form input, .stack-form select, .stack-form textarea, header button')?.focus())
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}><button className="modal-backdrop" onClick={onClose} aria-label="关闭" /><section className="modal" ref={modalRef}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><UiIcon name="close" /></button></header>{children}</section></div>
}
