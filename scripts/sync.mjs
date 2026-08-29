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

async function syncCodeforces(username) {
  const payload = await fetchJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(username)}&from=1&count=100000`)
  if (payload.status !== 'OK') throw new Error(payload.comment || 'Codeforces API error')
  const problems = new Map()
  for (const submission of payload.result) {
    if (submission.verdict !== 'OK') continue
    const { contestId, index, name, rating, tags = [] } = submission.problem
    const id = `codeforces-${contestId}-${index}`
    problems.set(id, {
      id,
      platform: 'codeforces',
      problemId: `${contestId}${index}`,
      title: name,
      url: `https://codeforces.com/problemset/problem/${contestId}/${index}`,
      difficulty: rating?.toString() || '',
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
let atcoderModels
async function syncAtCoder(username) {
  const [submissions, catalog, models] = await Promise.all([
    fetchJson(`https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(username)}&from_second=0`),
    atcoderCatalog || fetchJson('https://kenkoooo.com/atcoder/resources/problems.json'),
    atcoderModels || fetchJson('https://kenkoooo.com/atcoder/resources/problem-models.json'),
  ])
  atcoderCatalog = catalog
  atcoderModels = models
  const metadata = new Map(catalog.map((problem) => [problem.id, problem]))
  const problems = new Map()
  for (const submission of submissions) {
    if (submission.result !== 'AC') continue
    const item = metadata.get(submission.problem_id)
    const contest = item?.contest_id || submission.contest_id
    const id = `atcoder-${submission.problem_id}`
    const difficulty = models[submission.problem_id]?.difficulty
    problems.set(id, {
      id,
      platform: 'atcoder',
      problemId: submission.problem_id,
      title: item?.title || submission.problem_id,
      url: `https://atcoder.jp/contests/${contest}/tasks/${submission.problem_id}`,
      difficulty: Number.isFinite(difficulty) ? Math.round(difficulty).toString() : '',
      tags: [],
      favorite: false,
      collections: [],
      accepted: true,
      solution: '',
    })
  }
  return [...problems.values()]
}

const adapters = {
  codeforces: syncCodeforces,
  atcoder: syncAtCoder,
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
