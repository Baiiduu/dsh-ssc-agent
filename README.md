# DeepSeek Harness SSC Agent

> 当前开发版暂不集成 RAG：不挂载知识检索工具或 Embedding 设置服务。原 RAG 项目、语料和已有索引保留，后续按实际收益评估是否重新接入。

> 本地开发状态（未发布）：已接入 `@aaub-software/dsh-sbom-sca`，在 SSC preset 注册 `dependency_targets`、`dependency_audit`、`installed_npm_audit`，并加入中文 `ssc-dependency-analysis` Skill。分别提供依赖来源发现、锁文件/声明 SBOM、物理 npm 安装元数据 SBOM 与可选 OSV 查询。安装元数据不等于完整产物验证；尚待真实 DSH 会话验收。以下发布版说明不代表这些新功能已上架。

[English](#english) | [简体中文](#简体中文)

### 本地新增：核心安全调查能力（未发布，已同步日常 Web 配置）

2026-09-28 已将当前编译运行时、persona 和完整 skills 本地覆盖安装到 `E:/.dsh/profiles/web/node_modules/@aaub-software/dsh-ssc-agent`，33 个部署文件与工作区哈希一致，依赖安装保持原样。备份与清单位于 `E:/CodexData/ssc-daily-install-20260928-005550`。这是本地安装更新，未发布 npm 包；profile 的包管理来源仍是旧 tarball，重新安装依赖可能覆盖本地更新，届时需重新部署当前源码。

自主发现与深度核实任务会加载 `ssc-security-investigation`：从实际入口和安全不变量提出假设，双向追踪调用链，检查攻击者控制、可达性、防护及影响，主动寻找反证，再设计能区分原因的最小验证。源码、依赖和构建发布技能共用该方法；普通扫描和开发任务不强制加载。

新增 `security_investigation` 工具的 `save/get/list` 操作，支持没有扫描器 Finding ID 的独立发现，保存四条证据链、最强反解释、验证记录、版本和下一项检查。记录按调用者会话与工作区隔离，使用独立的 `aaub_ssc_investigations` 存储域，保留现有 SAST 数据与接口。列表每页 20 条，单个记录最多 64 KiB；引用大日志而不是嵌入全文。

工具校验缺失或重复证据引用、状态所需字段及复现记录类型；它不读取证据文件来鉴真，也不自动确认漏洞或新颖性。`supported` 是模型判断，动态复现另行记录，当前记录更新会替换上一版；需要审计历史时仍依赖会话工具日志和原始实验材料。旧版本记录恢复后必须重新核对受审代码。

验证命令为 `pnpm test`。另有[盲测案例与验收标准](evals/README.md)及两轮真实模型对照报告；结果尚未证明发现准确率提升，不能据此宣称已具备稳定发现零日的能力。2026-09-28 后续安全模型、证明义务与分层裁决修订仅完成静态检查，按用户要求暂停模型实验。本地部署没有更改模型路由、增加扫描器或启用 RAG。

### 本地新增：构建与发布审阅（未发布）

`ssc-build-release-review` 是随 SSC preset 分发的中文 Skill，使用已有文件搜索与读取工具审阅 CI/CD、发布脚本、权限凭据及产物传递，不新增扫描器。它位于 preset 已注册的 `skills/` 目录，随 npm Bundle 打包；模型可按任务加载，不会每次扫描都强制加载。

示例：`只读审阅当前仓库的构建与发布安全，说明源码到发布产物的链路、主要风险和无法验证的条件，不运行项目脚本。`

当前已加入源码，并通过本地 tarball 更新开发机的 web profile；真实 DSH 会话验收仍待完成。仅修改开发目录不会更新已安装的 npm 副本。Skill 是审阅指引，不是权限隔离机制，也不证明模型必然覆盖全部风险。本轮不启用 RAG、不部署定时任务，效果对比留到阶段收尾。

SSC persona 已统一说明源码安全、依赖与组件安全、构建与发布安全三个领域的职责：综合审计按项目适用性选择 Skill 和工具，专项任务保持范围；报告区分事实、推断、未知条件及实际覆盖，不把工具告警等同于可利用漏洞。该定位不更改部署的默认 Agent 模式。

## English

`@aaub-software/dsh-ssc-agent` adds an **SSC mode** to
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It combines a
software supply chain security persona, a static-analysis workflow skill, and
preconfigured SAST tools in one installable npm bundle.

The current release includes:

- `semgrep_scan` for general-purpose and multi-language Semgrep analysis.
- `eslint_security_scan` for fast JavaScript and TypeScript security hotspot detection.
- The `ssc-static-analysis` skill, which guides the model through two complementary paths:
  reviewing rule-engine findings in source context to reduce false positives, and directly
  examining relevant code to find issues that rules may miss.

Scanner findings are leads, not automatically confirmed vulnerabilities. The Agent is
instructed to separate observed evidence from inference and to assess reachability,
attacker control, security impact, and mitigating context before reporting conclusions.

### Requirements

- DeepSeek Harness
- Node.js 24.0.0 or newer
- pnpm available to the `dsh plugin` command
- Windows x64 for the bundled Semgrep runtime

The ESLint scanner and its JavaScript dependencies are installed with this package.
On Windows x64, the Semgrep package also installs a managed runtime containing CPython
and Semgrep. Users do not need to install ESLint, Python, or Semgrep separately.

### Install

Install the Agent bundle into the DSH profile you actually run. For the Web UI, use:

```powershell
dsh plugin --profile web add @aaub-software/dsh-ssc-agent
```

Then start or restart the Web profile from the repository you want to inspect:

```powershell
cd C:\path\to\your\repository
dsh web
```

Create a new session and select **SSC 模式** as its Agent mode. Installation registers
the new mode in the `web` profile; it does not replace the profile or change the global
default Agent. Existing sessions keep the mode with which they were created.

### Use

Ask the SSC Agent for a security review in ordinary language. For example:

```text
Scan this repository for application-security issues. Use the available rule engines,
then review each relevant finding against its source context. Also inspect important
entry points and data flows for vulnerabilities the rules may miss. Do not modify code.
```

For a narrower scan:

```text
Run the JavaScript/TypeScript security scanner against packages/api and review the
reported hotspots. Separate confirmed issues, likely false positives, and items that
need more evidence.
```

You can also ask for only one stage, such as running Semgrep, reviewing existing scanner
results, or performing a model-led analysis of a particular attack surface. The skill
does not force every scanner to run for every request.

### Included tools

| Tool | Best suited for | Important boundary |
| --- | --- | --- |
| `semgrep_scan` | General and multi-language rule-based SAST | Uses `p/default` in the current release; registry access may require a network connection. |
| `eslint_security_scan` | Fast JavaScript/TypeScript syntax and AST security checks | Does not load target-project ESLint config, `tsconfig.json`, suppressions, cache, or autofix. |

Both tools accept only targets inside the active workspace, run read-only scans, bound
their output, and support Harness cancellation and timeout controls.

On Windows, Semgrep Core cannot access the system certificate store inside the current
Harness ACL sandbox. Its first restricted call therefore returns a standard permission
upgrade request without starting the scan. Harness runs it with `danger-full-access`
only if the model retries with a justification and the user approves the request.

### Update or remove

```powershell
dsh plugin --profile web update @aaub-software/dsh-ssc-agent
dsh plugin --profile web remove @aaub-software/dsh-ssc-agent
```

Restart the profile after changing installed plugins.

### Scope and roadmap

Version 0.2 focuses on the static-analysis part of the wider SSC architecture. Future
releases may add SBOM, dependency analysis, vulnerability validation, remediation, and
reporting capabilities while keeping the preset as the orchestration layer.

### Source and licenses

- SSC Agent: [Baiiduu/dsh-ssc-agent](https://github.com/Baiiduu/dsh-ssc-agent)
- Semgrep tool: [Baiiduu/dsh-semgrep-sast](https://github.com/Baiiduu/dsh-semgrep-sast)
- ESLint Security tool: [Baiiduu/dsh-eslint-security-sast](https://github.com/Baiiduu/dsh-eslint-security-sast)

The Agent bundle is released under the MIT License. Bundled tools and their third-party
dependencies retain their respective licenses; see each tool repository for details.

## 简体中文

`@aaub-software/dsh-ssc-agent` 为
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 增加一个可选择的
**SSC 模式**。它把软件供应链安全 persona、静态分析工作流 skill 和预配置的 SAST 工具
组合成一个可通过 npm 安装的 Agent Bundle。

当前版本包含：

- `semgrep_scan`：用于通用及多语言 Semgrep 扫描。
- `eslint_security_scan`：用于快速发现 JavaScript 和 TypeScript 安全热点。
- `ssc-static-analysis` skill：指导模型采用两条互补路径——结合源码上下文审阅规则引擎
  的结果以减少误报，以及主动阅读相关代码以发现规则可能遗漏的问题。

扫描器命中只是调查线索，不会被自动认定为漏洞。Agent 会区分已观察到的证据与推断，
并在给出结论前分析可达性、攻击者可控性、安全影响和缓解条件。

### 环境要求

- DeepSeek Harness
- Node.js 24.0.0 或更高版本
- `dsh plugin` 命令能够使用 pnpm
- 使用内置 Semgrep 运行时时需要 Windows x64

ESLint 扫描器及其 JavaScript 依赖会随本包安装。在 Windows x64 上，Semgrep 包还会安装
包含 CPython 和 Semgrep 的托管运行时；用户不需要另行安装 ESLint、Python 或 Semgrep。

### 安装

把 Agent Bundle 安装到实际运行的 DSH profile。使用 Web UI 时执行：

```powershell
dsh plugin --profile web add @aaub-software/dsh-ssc-agent
```

然后在要分析的仓库目录中启动或重启 Web profile：

```powershell
cd C:\path\to\your\repository
dsh web
```

新建会话时，在 Agent 模式中选择 **SSC 模式**。安装命令是在 `web` profile 中注册这个
新模式，并不是用 SSC 替换 `web` profile，也不会修改机器的全局默认 Agent。已有会话
仍然保留创建时选择的模式。

### 使用

可以直接用自然语言要求 SSC Agent 进行安全审阅，例如：

```text
扫描当前仓库中的应用安全问题。先使用可用的规则引擎，再结合源码上下文复核相关结果；
同时主动检查重要入口和数据流，寻找规则可能遗漏的漏洞。不要修改代码。
```

也可以限定扫描范围：

```text
对 packages/api 运行 JavaScript/TypeScript 安全扫描并审阅安全热点，将结果区分为已确认问题、
可能的误报和仍需补充证据的项目。
```

你也可以只要求某一个阶段，例如只运行 Semgrep、只复核已有扫描结果，或者让模型主动分析
某个攻击面。skill 不会要求每次任务都运行所有扫描器。

### 内置工具

| 工具 | 适用场景 | 重要边界 |
| --- | --- | --- |
| `semgrep_scan` | 通用、多语言的规则型 SAST | 当前版本使用 `p/default`；获取 Registry 规则时可能需要网络。 |
| `eslint_security_scan` | 快速的 JavaScript/TypeScript 语法与 AST 安全检查 | 不读取目标项目的 ESLint 配置、`tsconfig.json`、suppression、cache，也不执行 autofix。 |

两个工具都只接受当前工作区内的目标，执行只读扫描，限制输出大小，并支持 Harness 的取消
和超时控制。

在 Windows 上，Semgrep Core 无法在当前 Harness ACL 沙箱中访问系统证书库。因此第一次
受限调用不会启动扫描，而是返回标准权限升级提示。只有模型携带理由使用
`danger-full-access` 重试，并且用户批准后，Harness 才会运行 Semgrep。

### 更新或移除

```powershell
dsh plugin --profile web update @aaub-software/dsh-ssc-agent
dsh plugin --profile web remove @aaub-software/dsh-ssc-agent
```

改变已安装插件后请重启相应 profile。

### 当前范围与后续方向

`0.2` 版本聚焦完整 SSC 架构中的静态分析部分。后续可以继续加入 SBOM、依赖分析、漏洞
验证、修复和报告能力，并由这个 preset 作为 Agent 的统一编排层。

### 源码与许可证

- SSC Agent：[Baiiduu/dsh-ssc-agent](https://github.com/Baiiduu/dsh-ssc-agent)
- Semgrep 工具：[Baiiduu/dsh-semgrep-sast](https://github.com/Baiiduu/dsh-semgrep-sast)
- ESLint Security 工具：[Baiiduu/dsh-eslint-security-sast](https://github.com/Baiiduu/dsh-eslint-security-sast)

Agent Bundle 使用 MIT 许可证。内置工具及其第三方依赖继续适用各自的许可证，详情请查看
对应工具仓库。
