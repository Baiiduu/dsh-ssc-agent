# DSH npm 发布链路：源码证据基线

记录日期：2026-09-26。状态：首轮源码人工核对完成，非完整安全审计，尚无模型对照实验结果。

## 对象与边界

- 仓库：`https://github.com/deepseek-ai/deepseek-harness.git`。
- 本机：`E:\agent\ssc\SoftSupplyChian\deepseek-harness`。
- 固定提交：`c291e7961a515f6d7af9304e7fd1d257929aef26`；读取前工作树干净。
- 主对象：`@deepseek-ai/dsh` 所在 dsh npm 发布家族；并非只打包 CLI 一个包。
- 只读取文件；没有运行目标仓库的安装、构建、打包、验证或发布脚本，没有触发 GitHub 工作流。
- 未读取平台审批/标签保护/凭据权限、具体运行日志或来源证明；没有对某个实际 npm tarball 建立来源验证。
- 本文是评审参考答案，不应作为 A/B/C 实验的模型输入。受测模型可以读原始仓库，但不可访问本研究目录。

## 两条不同链路

```text
PR / master push / 人工触发
  → release.yml
  → 依赖布局检查 + 安装、版本检查、构建、打包、安装探测
  → 上传 dsh-npm-tarballs（演练；该工作流没有 npm 发布步骤）

人工触发 release-publish.yml
  → pack job：checkout → 安装 → 发布标签/版本检查
             → official 构建 → 打包 → 安装探测 → 上传产物
  → publish job：needs: pack + environment: npm-publish
                → checkout → 禁止安装脚本的依赖安装
                → 下载产物 → 注入 NPM_TOKEN → 发布脚本 → npm
```

两个工作流使用相同产物名称，不等于 publish 会下载任意 PR 的同名产物。所审下载步骤未指定其他 run-id/repository；应结合 Action 的同运行默认语义判断，具体产物身份仍需运行记录确认。

## 证据表

以下位置均相对上述固定提交；路径和行号用于回查，不是运行成功证明。

| ID | 源码事实 | 位置 | 不能推出的结论 |
| --- | --- | --- | --- |
| E01 | 演练支持 PR、master push、人工触发；声明 contents: read | `.github/workflows/release.yml:10`、`:16` | 所有任务都没有隐含环境权限 |
| E02 | 演练 runner 选择有仓库、actor、事件和 fork 条件；回退 hosted runner | `.github/workflows/release.yml:33`、`:94` | 条件变量的实际值、持久 runner 的隔离状态 |
| E03 | 正式发布只声明 workflow_dispatch；全局 contents: read | `.github/workflows/release-publish.yml:8`、`:11` | 仅 YAML 就限制了只能从标签触发 |
| E04 | pack 先安装，之后设置 RELEASE_PUBLISH=true 调用 release:verify | `.github/workflows/release-publish.yml:52`、`:55` | 标签检查发生在所有项目代码执行之前 |
| E05 | verify 在发布模式检查可发布性和 GITHUB_REF；要求对应家族标签及版本 | `scripts/release/verify.ts:58`、`:95` | 标签不可被移动、提交已审查或环境审批已启用 |
| E06 | build:official 映射到 build.ts；依次 native-system、lib、web，并写 client 构建记录 | `package.json:22`、`scripts/build.ts:32` | 构建可复现或具有可信签名 provenance |
| E07 | dsh 家族覆盖 packages/apps 及选定 experimental 包，共享版本，标签前缀 dsh-v | `scripts/release/families.ts:323` | 发布对象只有 CLI，或包含全部 native/vendor 包 |
| E08 | pack 校验构建记录和版本，逐包 pnpm pack，校验 payload，写 publish-order.txt | `scripts/release/pack.ts:28`、`:60`、`:85` | 清单/产物已受密码学认证 |
| E09 | client 构建记录检查环境以及当前 client 文件计数/摘要 | `scripts/client-build-environment.ts:300` | 已验证全部 tarball、所有源码或供应商身份 |
| E10 | 安装探测使用 dsh/vendor/Landlock entry 的包；临时 npm 安装省略 optional，随后检查 CLI --version | `.github/workflows/release-publish.yml:66`、`scripts/release/verify-packed-install.ts:70` | 所有平台可选运行时或完整业务功能已测试 |
| E11 | 上传 dist/npm/*；publish needs pack，引用 npm-publish 环境，不取消进行中的同组发布 | `.github/workflows/release-publish.yml:85`、`:91` | 环境必定配置 required reviewers 或限制标签 |
| E12 | publish checkout 不持久化凭据，安装使用 --ignore-scripts；下载 dsh-npm-tarballs | `.github/workflows/release-publish.yml:107`、`:120`、`:123` | 后面的 pnpm run 不执行仓库脚本 |
| E13 | NODE_AUTH_TOKEN 只在可见发布步骤显式引用 secrets.NPM_TOKEN，调用 release:publish | `.github/workflows/release-publish.yml:128`、`package.json:178` | token 的真实范围/有效性，或实际运行中从未泄露 |
| E14 | publish 读产物中的名称/版本；比较已发布 dist.integrity，相同则跳过，不同则失败，缺失则 npm publish | `scripts/release/publish.ts:63`、`:74`、`:109`、`:146` | digest 相等即证明来源可信、可复现或没有恶意代码 |

## 目前可归纳的控制与待核查项

观察到的控制：演练与发布分开；pack/publish 分任务；发布标签及版本检查；publish 的安装步骤禁用生命周期脚本；凭据显式限定在发布步骤；使用打包后的 tarball；已有版本有完整性冲突检查。

待核查而非已确认漏洞：

1. `npm-publish` 环境的审批者、允许 ref、绕过权限；标签保护与发布触发者权限。
2. 发布步骤仍执行仓库的 TypeScript 发布脚本，故所选提交及脚本自身是凭据边界的一部分。`--ignore-scripts` 只约束安装步骤，不能被解释为整个 job 不执行项目代码。
3. Actions 使用版本标签而非完整提交摘要；这是可变构建材料的观察项，不证明 Action 已被替换或项目已受攻击。
4. pack 恢复 pnpm 缓存并使用 frozen lock；还需读取安装策略与包完整性行为，不能仅凭 restore-keys 就认定缓存投毒可利用。
5. 同一运行内 artifact 传递关系可从配置推断；若要确认一次真实发布，需要 run ID、head SHA、artifact 身份、日志及发布包摘要。
6. 所读脚本没有建立完整的签名来源验证链；不据此断言平台或注册表绝无其他证明。

## 覆盖与停止点

完整阅读了两个主工作流、build.ts、release 的 verify/pack/publish/tarball/process/verify-packed-install；重点读取 families 的 dsh 家族逻辑和 client 构建记录检查。未逐一审阅所有构建配置、包生命周期脚本、第三方 Action 源码，也未完成 native/vendor/Python 独立发布链。

因此本基线足以定义首轮流程还原任务，但不是完整发布安全结论；没有确认零日漏洞，也没有给仓库评定安全等级。

## 官方语义参考

- [GitHub 工作流语法：触发器、权限、任务依赖和环境](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub 环境和部署保护](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [download-artifact v4：官方输入定义及默认运行范围](https://raw.githubusercontent.com/actions/download-artifact/v4/action.yml)

平台文档解释语义，不替代当前仓库的平台设置和运行证据。
