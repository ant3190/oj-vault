import type { Account, Collection, Problem } from './types'

const STORAGE_KEY = 'oj-vault-state-v1'
const ADMIN_TOKEN_KEY = 'oj-vault-admin-token-v1'
export const SYNC_API = 'https://oj-vault-sync.true-fir-4785.chatgpt.site'

export interface VaultState {
  problems: Problem[]
  collections: Collection[]
  accounts: Account[]
}

export const emptyState: VaultState = {
  problems: [],
  collections: [],
  accounts: [],
}

type RemoteAccount = {
  id: string
  platform: Account['platform']
  username: string
  enabled: boolean
  lastStatus?: 'ok' | 'limited' | 'error' | 'disabled' | null
  lastMessage?: string | null
  lastSyncedAt?: string | null
}

type RemoteProblem = {
  id: string
  platform: Problem['platform']
  problemId: string
  title: string
  url: string
  difficulty?: string
  difficultyManual?: boolean
  tags?: string[]
  favorite?: boolean
  collections?: string[]
  accepted?: boolean
  acceptedAt?: string | null
  activityAt?: string | null
  updatedAt?: string | null
  solution?: string
}

type RemoteState = {
  accounts: RemoteAccount[]
  problems: RemoteProblem[]
  syncedAt: string | null
  partial?: boolean
}

function latestTime(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) || null
}

function keepManualDifficulty(problem: Problem): Problem {
  const difficultyManual = problem.difficultyManual === true
  return {
    ...problem,
    difficulty: difficultyManual ? problem.difficulty || '' : '',
    difficultyManual,
  }
}

function canonicalizeProblem(problem: Problem): Problem {
  const rawProblemId = problem.problemId.trim()
  const luoguPid = problem.platform === 'luogu' ? rawProblemId.toUpperCase() : ''
  const codeforces = (problem.platform === 'codeforces' ? rawProblemId.toUpperCase() : luoguPid)
    .match(/^(?:CF)?(\d+)[-\s]?([A-Z]\d*)$/)
  if (codeforces && (problem.platform === 'codeforces' || luoguPid.startsWith('CF'))) {
    const [, contestId, index] = codeforces
    return {
      ...problem,
      id: `codeforces-${contestId}-${index}`,
      platform: 'codeforces',
      problemId: `${contestId}${index}`,
      url: problem.platform === 'codeforces' ? problem.url : `https://codeforces.com/problemset/problem/${contestId}/${index}`,
    }
  }

  const atcoder = (problem.platform === 'atcoder' ? rawProblemId : luoguPid.replace(/^AT_/i, '')).toLowerCase()
  if (problem.platform === 'atcoder' || luoguPid.startsWith('AT_')) {
    const contestId = atcoder.split('_')[0]
    return {
      ...problem,
      id: `atcoder-${atcoder}`,
      platform: 'atcoder',
      problemId: atcoder,
      url: problem.platform === 'atcoder' ? problem.url : `https://atcoder.jp/contests/${contestId}/tasks/${atcoder}`,
    }
  }

  return problem
}

function normalizeRemoteProblem(problem: RemoteProblem): Problem {
  return {
    ...problem,
    difficulty: '',
    difficultyManual: false,
    tags: problem.tags || [],
    favorite: false,
    collections: [],
    accepted: problem.accepted !== false,
    solution: '',
  }
}

function mergeProblems(remote: RemoteProblem[], local: Problem[]) {
  const merged = new Map<string, Problem>()
  remote.forEach((rawProblem) => {
    const problem = canonicalizeProblem(normalizeRemoteProblem(rawProblem))
    merged.set(problem.id, {
      ...problem,
      difficulty: '',
      difficultyManual: false,
      favorite: false,
      collections: [],
      solution: '',
    })
  })
  local.forEach((rawProblem) => {
    const problem = canonicalizeProblem(keepManualDifficulty(rawProblem))
    const synced = merged.get(problem.id)
    merged.set(problem.id, synced ? {
      ...synced,
      difficulty: problem.difficulty,
      difficultyManual: problem.difficultyManual,
      tags: problem.tags.length ? problem.tags : synced.tags,
      favorite: problem.favorite || synced.favorite,
      collections: [...new Set([...synced.collections, ...problem.collections])],
      accepted: synced.accepted || problem.accepted,
      acceptedAt: latestTime(synced.acceptedAt, problem.acceptedAt),
      solution: problem.solution || synced.solution,
      activityAt: latestTime(synced.activityAt, synced.acceptedAt, problem.activityAt, problem.acceptedAt),
    } : problem)
  })
  return [...merged.values()].sort((left, right) => {
    const leftValue = left.activityAt || left.acceptedAt
    const rightValue = right.activityAt || right.acceptedAt
    const leftTime = leftValue ? Date.parse(leftValue) : Number.NEGATIVE_INFINITY
    const rightTime = rightValue ? Date.parse(rightValue) : Number.NEGATIVE_INFINITY
    if (leftTime !== rightTime) return rightTime - leftTime
    return left.id.localeCompare(right.id)
  })
}

function normalizeAccounts(accounts: RemoteAccount[]): Account[] {
  return accounts.map((account) => {
    const legacyQojLimit = account.platform === 'qoj'
      && account.lastStatus === 'error'
      && /could not find accepted problems|cloudflare|\b403\b/i.test(account.lastMessage || '')
    const limited = account.lastStatus === 'limited' || legacyQojLimit
    return {
      id: account.id,
      platform: account.platform,
      username: account.username,
      enabled: account.enabled,
      lastSync: account.lastSyncedAt || undefined,
      lastMessage: limited ? '账号已绑定；QOJ 当前限制未登录访问，暂时无法自动导入公开题单' : account.lastMessage || undefined,
      syncState: account.lastStatus === 'ok' ? 'success' : limited ? 'limited' : account.lastStatus === 'error' ? 'error' : 'idle',
    }
  })
}

async function fetchRemoteState(): Promise<RemoteState> {
  const response = await fetch(`${SYNC_API}/api/state`, { cache: 'no-cache' })
  if (!response.ok) throw new Error('同步服务暂时不可用')
  return response.json()
}

export async function loadState(): Promise<VaultState> {
  let local: VaultState | null = null
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) try { local = JSON.parse(saved) as VaultState } catch { localStorage.removeItem(STORAGE_KEY) }
  if (local) local = { ...local, problems: local.problems.map(keepManualDifficulty) }
  try {
    const base = import.meta.env.BASE_URL
    const [remote, fallbackProblems, collections, fallbackAccounts] = await Promise.all([
      fetchRemoteState(),
      fetch(`${base}data/problems.json`).then((response) => response.json()),
      fetch(`${base}data/collections.json`).then((response) => response.json()),
      fetch(`${base}data/accounts.json`).then((response) => response.json()),
    ])
    const localProblems = local?.problems || fallbackProblems
    const collectionMap = new Map<string, Collection>(collections.map((collection: Collection) => [collection.id, collection]))
    local?.collections.forEach((collection) => collectionMap.set(collection.id, collection))
    return {
      problems: mergeProblems(remote.problems, localProblems),
      collections: [...collectionMap.values()],
      accounts: remote.syncedAt !== null || remote.accounts.length ? normalizeAccounts(remote.accounts) : (local?.accounts || fallbackAccounts),
    }
  } catch {
    return local || emptyState
  }
}

export function saveState(state: VaultState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || ''
}

export function saveAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

export async function saveAccountsAndSync(accounts: Account[], token: string) {
  const response = await fetch(`${SYNC_API}/api/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accounts: accounts.map(({ id, platform, username, enabled }) => ({ id, platform, username, enabled })),
    }),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string; imported?: number; state?: RemoteState }
  if (!response.ok) {
    const error = new Error(payload.error || '同步失败') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  const remote = payload.state || await fetchRemoteState()
  return { remote, imported: payload.imported || 0 }
}

export function mergeSyncedState(current: VaultState, remote: RemoteState): VaultState {
  return {
    ...current,
    accounts: normalizeAccounts(remote.accounts),
    problems: mergeProblems(remote.problems, current.problems),
  }
}
