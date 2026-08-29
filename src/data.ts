import type { Account, Collection, Problem } from './types'

const STORAGE_KEY = 'oj-vault-state-v1'

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

export async function loadState(): Promise<VaultState> {
  let local: VaultState | null = null
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) try { local = JSON.parse(saved) as VaultState } catch { localStorage.removeItem(STORAGE_KEY) }
  try {
    const base = import.meta.env.BASE_URL
    const [problems, collections, accounts] = await Promise.all([
      fetch(`${base}data/problems.json`).then((response) => response.json()),
      fetch(`${base}data/collections.json`).then((response) => response.json()),
      fetch(`${base}data/accounts.json`).then((response) => response.json()),
    ])
    if (!local) return { problems, collections, accounts }
    const problemMap = new Map<string, Problem>(problems.map((problem: Problem) => [problem.id, problem]))
    local.problems.forEach((problem) => problemMap.set(problem.id, { ...problemMap.get(problem.id), ...problem }))
    const collectionMap = new Map<string, Collection>(collections.map((collection: Collection) => [collection.id, collection]))
    local.collections.forEach((collection) => collectionMap.set(collection.id, collection))
    return { problems: [...problemMap.values()], collections: [...collectionMap.values()], accounts }
  } catch {
    return local || emptyState
  }
}

export function saveState(state: VaultState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
