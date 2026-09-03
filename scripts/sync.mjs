import { readFile, writeFile } from 'node:fs/promises'

const dataPath = new URL('../public/data/', import.meta.url)
const accounts = JSON.parse(await readFile(new URL('accounts.json', dataPath), 'utf8'))
const existing = JSON.parse(await readFile(new URL('problems.json', dataPath), 'utf8'))

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'OJ-Vault/0.1 (+https://github.com/ant3190/oj-vault)' },
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'user-agent': 'OJ-Vault/0.1 (+https://github.com/ant3190/oj-vault)',
      accept: 'text/html,application/json',
      ...options.headers,
    },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.text()
}

async function syncCodeforces(username) {
  const payload = await fetchJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(username)}&from=1&count=100000`)
  if (payload.status !== 'OK') throw new Error(payload.comment || 'Codeforces API error')
  const problems = new Map()
  for (const submission of payload.result) {
    if (submission.verdict !== 'OK') continue
    const { contestId, index, name, tags = [] } = submission.problem
    const id = `codeforces-${contestId}-${index}`
    problems.set(id, {
      id,
      platform: 'codeforces',
      problemId: `${contestId}${index}`,
      title: name,
      url: `https://codeforces.com/problemset/problem/${contestId}/${index}`,
      difficulty: '',
      tags,
      favorite: false,
      collections: [],
      accepted: true,
      solution: '',
    })
  }
  return [...problems.values()]
}

let atcoderCatalog
async function syncAtCoder(username) {
  const [submissions, catalog] = await Promise.all([
    fetchJson(`https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(username)}&from_second=0`),
    atcoderCatalog || fetchJson('https://kenkoooo.com/atcoder/resources/problems.json'),
  ])
  atcoderCatalog = catalog
  const metadata = new Map(catalog.map((problem) => [problem.id, problem]))
  const problems = new Map()
  for (const submission of submissions) {
    if (submission.result !== 'AC') continue
    const item = metadata.get(submission.problem_id)
    const contest = item?.contest_id || submission.contest_id
    const id = `atcoder-${submission.problem_id}`
    problems.set(id, {
      id,
      platform: 'atcoder',
      problemId: submission.problem_id,
      title: item?.title || submission.problem_id,
      url: `https://atcoder.jp/contests/${contest}/tasks/${submission.problem_id}`,
      difficulty: '',
      tags: [],
      favorite: false,
      collections: [],
      accepted: true,
      solution: '',
    })
  }
  return [...problems.values()]
}

async function syncLuogu(username) {
  const body = await fetchText(`https://www.luogu.com.cn/user/${encodeURIComponent(username)}/practice`, {
    headers: { 'x-lentille-request': 'content-only' },
  })
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    throw new Error('Luogu returned a verification page')
  }
  const passed = payload.data?.passed || []
  return passed.map((item) => ({
    id: `luogu-${item.pid}`,
    platform: 'luogu',
    problemId: item.pid,
    title: item.name || item.pid,
    url: `https://www.luogu.com.cn/problem/${item.pid}`,
    difficulty: '',
    tags: [],
    favorite: false,
    collections: [],
    accepted: true,
    solution: '',
  }))
}

async function syncUojFamily(platform, baseUrl, username) {
  const html = await fetchText(`${baseUrl}/user/profile/${encodeURIComponent(username)}`)
  if (/Just a moment|cf-chl-|challenge-platform/i.test(html)) {
    throw new Error(`${platform.toUpperCase()} returned a Cloudflare verification page`)
  }
  const ids = new Set()
  for (const match of html.matchAll(/href=["'](?:https?:\/\/[^/]+)?\/problem\/(\d+)(?:[?#][^"']*)?["']/gi)) ids.add(match[1])
  if (!ids.size && !/accepted problems|通过的题目|已通过题目/i.test(html)) {
    throw new Error(`could not find the accepted-problem section on ${platform.toUpperCase()} profile`)
  }
  return [...ids].map((problemId) => ({
    id: `${platform}-${problemId}`,
    platform,
    problemId,
    title: `${platform.toUpperCase()} #${problemId}`,
    url: `${baseUrl}/problem/${problemId}`,
    difficulty: '',
    tags: [],
    favorite: false,
    collections: [],
    accepted: true,
    solution: '',
  }))
}

const syncQoj = (username) => syncUojFamily('qoj', 'https://qoj.ac', username)
const syncUoj = (username) => syncUojFamily('uoj', 'https://uoj.ac', username)

const adapters = {
  luogu: syncLuogu,
  codeforces: syncCodeforces,
  atcoder: syncAtCoder,
  qoj: syncQoj,
  uoj: syncUoj,
}

const imported = []
for (const account of accounts.filter((item) => item.enabled)) {
  const adapter = adapters[account.platform]
  if (!adapter) {
    console.warn(`[skip] ${account.platform}/${account.username}: adapter is not enabled yet`)
    continue
  }
  try {
    const problems = await adapter(account.username)
    imported.push(...problems)
    console.log(`[ok] ${account.platform}/${account.username}: ${problems.length} accepted problems`)
  } catch (error) {
    console.error(`[error] ${account.platform}/${account.username}: ${error.message}`)
  }
}

const merged = new Map(existing.map((problem) => [problem.id, problem]))
for (const problem of imported) {
  const old = merged.get(problem.id)
  merged.set(problem.id, old ? {
    ...problem,
    favorite: old.favorite,
    collections: old.collections,
    solution: old.solution,
    tags: old.tags?.length ? old.tags : problem.tags,
  } : problem)
}

const output = [...merged.values()].sort((a, b) => a.platform.localeCompare(b.platform) || a.problemId.localeCompare(b.problemId))
await writeFile(new URL('problems.json', dataPath), `${JSON.stringify(output, null, 2)}\n`)
console.log(`OJ Vault now contains ${output.length} problems.`)
