export type Platform = 'luogu' | 'codeforces' | 'qoj' | 'uoj' | 'atcoder'

export interface Account {
  id: string
  platform: Platform
  username: string
  enabled: boolean
  lastSync?: string
  lastMessage?: string
  syncState?: 'idle' | 'syncing' | 'success' | 'error'
}

export interface Problem {
  id: string
  platform: Platform
  problemId: string
  title: string
  url: string
  difficulty: string
  tags: string[]
  favorite: boolean
  collections: string[]
  accepted: boolean
  acceptedAt?: string | null
  activityAt?: string | null
  updatedAt?: string | null
  solution: string
}

export interface Collection {
  id: string
  name: string
}

export type Page = 'problems' | 'collections' | 'accounts'
