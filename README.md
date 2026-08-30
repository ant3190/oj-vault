# OJ Vault

你的个人算法题库。集中保存来自多个 OJ 的已通过题目、难度、标签、收藏、归类和 Markdown 题解。

## 当前功能

- 题目搜索与平台、通过状态、收藏筛选
- 难度、标签、收藏、归类和通过状态管理
- Markdown 题解编辑与预览
- 自定义题目归类
- 洛谷、Codeforces、QOJ、UOJ、AtCoder 多账号绑定界面
- Codeforces 浏览器即时同步
- Codeforces、AtCoder、Luogu、QOJ、UOJ GitHub Actions 定时同步
- GitHub Pages 自动构建与部署

账号、题目与归类在网页中会先保存在浏览器本地。供 GitHub Actions 使用的账号配置位于 `public/data/accounts.json`。

在网页中可以连续修改多个账号，最后点击一次“保存并同步”。网站会打开一个预填好的 GitHub Issue，仓库所有者确认一次后，工作流会保存整份账号配置并自动开始同步。

## 本地开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 数据文件

- `public/data/accounts.json`：用于自动同步的 OJ 账号
- `public/data/problems.json`：题目数据
- `public/data/collections.json`：默认归类

同一平台可以配置多个账号：

```json
[
  {
    "id": "cf-main",
    "platform": "codeforces",
    "username": "your_handle",
    "enabled": true
  }
]
```

五个平台的同步都只读取公开数据，不需要密码或 Cookie。Luogu 使用公开练习记录，QOJ、UOJ 使用公开个人主页；站点临时触发验证时，本次同步会跳过该平台，不影响其他平台的数据。

## 部署

仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions**。之后每次推送到 `main` 都会自动部署。
