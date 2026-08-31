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
  lastStatus?: 'ok' | 'error' | 'disabled' | null
  lastMessage?: string | null
  lastSyncedAt?: string | null
}

type RemoteState = {
  accounts: RemoteAccount[]
  problems: Problem[]
  syncedAt: string | null
}

function mergeProblems(remote: Problem[], local: Problem[]) {
  const merged = new Map<string, Problem>()
  remote.forEach((problem) => merged.set(problem.id, {
    ...problem,
    favorite: false,
    collections: [],
    solution: '',
  }))
  local.forEach((problem) => {
    const synced = merged.get(problem.id)
    merged.set(problem.id, synced ? {
      ...synced,
      difficulty: problem.difficulty || synced.difficulty,
      tags: problem.tags.length ? problem.tags : synced.tags,
      favorite: problem.favorite,
      collections: problem.collections,
      solution: problem.solution,
    } : problem)
  })
  return [...merged.values()].sort((left, right) => {
    const leftTime = left.acceptedAt ? Date.parse(left.acceptedAt) : Number.NEGATIVE_INFINITY
    const rightTime = right.acceptedAt ? Date.parse(right.acceptedAt) : Number.NEGATIVE_INFINITY
    if (leftTime !== rightTime) return rightTime - leftTime
    return left.id.localeCompare(right.id)
  })
}

function normalizeAccounts(accounts: RemoteAccount[]): Account[] {
  return accounts.map((account) => ({
    id: account.id,
    platform: account.platform,
    username: account.username,
    enabled: account.enabled,
    lastSync: account.lastSyncedAt || undefined,
    lastMessage: account.lastMessage || undefined,
    syncState: account.lastStatus === 'ok' ? 'success' : account.lastStatus === 'error' ? 'error' : 'idle',
  }))
}

async function fetchRemoteState(): Promise<RemoteState> {
  const response = await fetch(`${SYNC_API}/api/state`, { cache: 'no-store' })
  if (!response.ok) throw new Error('同步服务暂时不可用')
  return response.json()
}

export async function loadState(): Promise<VaultState> {
  let local: VaultState | null = null
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) try { local = JSON.parse(saved) as VaultState } catch { localStorage.removeItem(STORAGE_KEY) }
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
  const payload = await response.json().catch(() => ({})) as { error?: string; imported?: number }
  if (!response.ok) {
    const error = new Error(payload.error || '同步失败') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  const remote = await fetchRemoteState()
  return { remote, imported: payload.imported || 0 }
}

export function mergeSyncedState(current: VaultState, remote: RemoteState): VaultState {
  return {
    ...current,
    accounts: normalizeAccounts(remote.accounts),
    problems: mergeProblems(remote.problems, current.problems),
  }
}
