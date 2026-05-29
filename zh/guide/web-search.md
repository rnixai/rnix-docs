# 网络搜索与抓取

`/dev/web` 设备通过两个 VFS 工具——`WebSearch` 和 `WebFetch`——为智能体提供网络搜索和页面抓取能力。

---

## 概览

```
Agent Process
    │
    │  Open("/dev/web")
    ▼
VFS DeviceRegistry → /dev/web
    │
    ├── WebSearch(query, domains?, max_results?) → Tavily / Exa / SearXNG
    └── WebFetch(url, prompt?) → Markdown
```

智能体通过标准 VFS 操作访问网络能力。设备在 daemon 启动时自动检测可用的后端。

---

## 快速开始

设置一个环境变量，daemon 即可自动检测后端：

| 后端 | 环境变量 | 备注 |
|------|---------|------|
| **Tavily** | `TAVILY_API_KEY` | 免费套餐见 [tavily.com](https://tavily.com) |
| **Exa** | `EXA_API_KEY` | 付费；研究级质量 |
| **SearXNG** | `RNIX_SEARCH_URL` | 自托管，例如 `http://localhost:8888` |

**自动检测优先级**（多个同时设置时）：`TAVILY_API_KEY > EXA_API_KEY > RNIX_SEARCH_URL`

查看 daemon 日志确认：

```
[web] search backend auto-detected: tavily
```

---

## 显式配置：`web-search.yaml`

多后端设置或需要精细控制时，在以下位置之一创建 YAML 配置：

1. `<project>/.rnix/web-search.yaml`（项目级，优先）
2. `~/.config/rnix/web-search.yaml`（全局）

```yaml
version: "1"
default_backend: tavily
backends:
  - name: tavily
    driver: tavily
    api_key_env: TAVILY_API_KEY
    max_results: 5
    search_depth: basic            # basic | advanced

  - name: exa
    driver: exa
    api_key_env: EXA_API_KEY
    num_results: 5

  - name: local-searxng
    driver: searxng
    base_url: http://localhost:8888
```

项目级文件完全覆盖全局文件（不合并）。API key 从项目 `.env` 文件中解析，失败时回退到宿主机环境变量——绝对不要在 YAML 中直接存储 key。

---

## 后端行为

### Tavily

- **搜索深度**：`basic`（更快）或 `advanced`（更全面）
- **域名过滤**：服务端 `include_domains` / `exclude_domains`
- **免费套餐**：速率受限；生产环境建议升级

### Exa

- **质量**：研究级，技术查询相关性更高
- **域名过滤**：服务端 `includeDomains` / `excludeDomains`（驼峰命名）
- **定价**：仅付费，无免费套餐

### SearXNG

- **隐私**：自托管，不依赖第三方 API
- **域名过滤**：查询中使用 `site:` 操作符 + 客户端对 blocked domains 的过滤
- **部署**：需要运行 SearXNG 实例

---

## 域名过滤

`WebSearch` 工具都接受 `allowed_domains` 和 `blocked_domains` 数组。智能体可以使用它们来限定搜索范围：

```
Tool call: WebSearch({
  query: "Go 并发模式",
  allowed_domains: ["go.dev", "github.com/golang"],
  blocked_domains: ["medium.com"]
})
```

过滤行为因后端而异——见上文[后端行为](#后端行为)。

---

## 错误处理

| 症状 | 修复方法 |
|------|---------|
| `WebSearch backend not configured...` | 设置三个环境变量之一，或编写 `web-search.yaml` |
| `tavily: HTTP 401` / `exa: HTTP 401` | API key 无效或已撤销——验证环境变量的值 |
| `tavily: HTTP 429` | 免费套餐速率限制——等待或升级 |
| `[web] backend X skipped: missing API key` | YAML 列出了后端 X 但其 `api_key_env` 解析为空 |

错误以 `DriverError` 的形式暴露给智能体——LLM 可以选择重试、切换策略或给出配置提示。不存在静默失败路径。

---

## 在 Skill 中使用网络工具

在 Skill 的 `allowed-tools` 中添加 `/dev/web` 以启用网络访问：

```yaml
---
name: web-research
description: "搜索网络获取技术信息"
allowed-tools: /dev/web /dev/fs
---
```

拥有此 Skill 的智能体便可在推理过程中调用 `WebSearch` 和 `WebFetch`。

---

## 追踪网络操作

```bash
$ rnix strace 1
[  3.421s] Open("/dev/web") → FD(5)
[  3.423s] Write(FD(5), {"tool":"WebSearch","query":"Go generics tutorial"}) → ok  1200ms
[  4.623s] Read(FD(5), 65536) → [{"title":"...","url":"...","snippet":"..."}]  1ms
[  4.625s] Write(FD(5), {"tool":"WebFetch","url":"https://go.dev/doc/tutorial/generics"}) → ok  800ms
[  5.425s] Read(FD(5), 65536) → "# Tutorial: Getting started with generics..."  2ms
[  5.428s] Close(FD(5)) → ok
```

---

## 相关文档

- [配置](/zh/guide/configuration) — `web-search.yaml` 详情
- [核心概念](/zh/guide/concepts) — VFS 设备模型
- [LLM 提供商](/zh/guide/llm-providers) — 提供商配置
