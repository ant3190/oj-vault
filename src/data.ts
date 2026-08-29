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
  const local = localStorage.getItem(STORAGE_KEY)
  if (local) {
    try {
      return JSON.parse(local) as VaultState
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  try {
    const base = import.meta.env.BASE_URL
    const [problems, collections, accounts] = await Promise.all([
      fetch(`${base}data/problems.json`).then((response) => response.json()),
      fetch(`${base}data/collections.json`).then((response) => response.json()),
      fetch(`${base}data/accounts.json`).then((response) => response.json()),
    ])
    return { problems, collections, accounts }
  } catch {
    return emptyState
  }
}

export function saveState(state: VaultState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
