# 维护指南

[English](./maintenance.md)

本仓库把改造过的八个 skill 作为**增量叠加层（delta overlay）**发布：`upstream/` 保存上游文件的快照，`deltas/mappings/*.md` 用带类型的 op 描述本仓库的每一处改动，`skills/` 由二者生成。本指南介绍维护者需要的机制：manifest、映射格式、命令，以及如何更新上游快照。仓库定位与安装见 [README](../README.cn.md)；fork 改了什么、为什么改见 [与上游的差异](./upstream-differences.cn.md)。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `upstream/` | 手工复制的八个上游 skill 目录快照（`wayfinder`、`setup-matt-pocock-skills`、`to-spec`、`to-tickets`、`ask-matt`、`prototype`、`code-review`、`tdd`）。可能带 CRLF，构建读取时会归一化。未列入 manifest 的文件一律忽略，也不会随仓库发布。 |
| [deltas/manifest.json](../deltas/manifest.json) | `files` 白名单：本仓库为这八个 skill 发布的全部 17 个文件。 |
| `deltas/mappings/<skill>.md` | 每个生成 skill 一份映射文档，用带类型的 op 表达 fork 的全部改动，是人工评审的入口。八份文档：[wayfinder](../deltas/mappings/wayfinder.md)、[setup-matt-pocock-skills](../deltas/mappings/setup-matt-pocock-skills.md)、[to-spec](../deltas/mappings/to-spec.md)、[to-tickets](../deltas/mappings/to-tickets.md)、[ask-matt](../deltas/mappings/ask-matt.md)、[prototype](../deltas/mappings/prototype.md)、[code-review](../deltas/mappings/code-review.md)、[tdd](../deltas/mappings/tdd.md)。 |
| [deltas/build.mjs](../deltas/build.mjs) | 由 `upstream/` + 映射重新生成 `skills/`；`--check` 只校验、不写文件。 |
| [deltas/ops.mjs](../deltas/ops.mjs) | op 的解析与应用逻辑，构建与预览共用同一份实现，两者不可能各说各话。 |
| [deltas/check-upstream.mjs](../deltas/check-upstream.mjs) | 将快照与 `mattpocock/skills` 对比，可走 GitHub API 或本地检出。 |
| [deltas/preview.mjs](../deltas/preview.mjs) | 把映射渲染成差异页面（`deltas/preview.html`，已 gitignore）。 |
| `skills/` | 安装产物：八个 skill 的生成文件，加上手写的 `lighthouse`、`backtracer`、`traverse`、`to-contract`。 |

## 生成文件与手写 skill

`deltas/manifest.json` 只包含一个 `files` 数组，每项是 `<skill>/<file>` 形式的路径。只有这些路径会从 `upstream/` 读取并写入 `skills/`；生成的 skill 目录由路径的第一段推导得出。

- **生成 skill**：上面的八个改造 skill。它们的 `skills/<skill>/` 目录严格等于 manifest 白名单，不多一个文件。
- **手写 skill**：[lighthouse](../skills/lighthouse/SKILL.md)、[backtracer](../skills/backtracer/SKILL.md)、[traverse](../skills/traverse/SKILL.md)、[to-contract](../skills/to-contract/SKILL.md) 是本仓库原生的：不在 manifest 中，没有 `upstream/` 对应物，构建不会碰它们，直接编辑即可。
- **原样复制的文件**：白名单中没有映射 op 的文件会按快照逐字节复制（仅做换行归一化）。它仍然是生成文件，同样受下面的清理规则约束。

**破坏性清理警告。** 写入式构建（`node deltas/build.mjs`）会删除生成 skill 目录中所有不在 `manifest.files` 里的文件，并删除因此变空的目录。不要在这八个 skill 的 `skills/<skill>/` 里放笔记、临时实验或生成的素材——它们会被无提示地删除，即使已经提交，只要上游没有对应文件也一样。要发布额外的上游文件，必须把它复制进 `upstream/` 并加入 manifest。

## 改映射，不要改生成文件

绝不要编辑 `skills/` 下的 17 个生成文件：下一次构建会覆盖它们，或在其退出 manifest 时将其清理。对生成 skill 的每一处改动都写在 `deltas/mappings/<skill>.md` 里，流程是：

1. 编辑映射文档（每个 skill 一份；即使文件都无需改动，该 skill 仍需一份文档）。
2. 运行 `node deltas/build.mjs` 重新生成，或运行 `node deltas/build.mjs --check` 只校验不写入。
3. 检查重新生成的结果——`git diff skills/`，或预览页面。
4. 把映射改动与重新生成的产物放在同一个提交里。

**仅重构映射（mapping-only refactor）**——重命名或拆分 op ID、搬移说明文字、调整 op 顺序，但不改变它们产出的内容——必须让 `skills/` 逐字节保持不变；重新构建后 `git diff skills/` 必须为空。这是评审区分「结构调整」与「行为改变」的依据；而行为改变必须体现为对应的 `skills/` 差异。

## 一个 op 对应一项行为

每个 op 只拥有一项可独立变更的 fork 行为，ID 按这项行为命名，而不是按步骤号或位置命名；两项行为就是两个 op，即使它们落在同一处文本上也一样。更新快照时，每个 op 要么照常生效（行为未被触动），要么单独报错，因此人只需要决定锚点被移动的那一个 op。与该 op 无关的上游文字要留在编辑范围之外，在定位唯一的前提下也留在锚点之外；优先使用快照中的锚点，而不是前一个 op 生成的文本，必要时在 op 的说明中写清顺序依赖。

为新基线重新指定锚点、与改变 fork 行为，是两类不同的改动，因此 diff 中永远不会把「上游改了措辞」和「fork 做了新决定」混在一起（[ADR 0002](./adr/0002-typed-anchored-ops.md)）。

## 映射文档格式

每份 `deltas/mappings/<skill>.md` 由若干目标（target）组成，每个目标下是若干 op：

````text
# <skill>                      （必须与 skill 名完全一致）
## <skill>/<file>              （白名单中的目标；无需改动的目标直接省略）
### <op-id>                    （小写 kebab-case，在 skill 内唯一）
<说明文字：这个 op 拥有哪项 fork 行为、为什么>

```op
anchor: |-
  <upstream/<file> 中必须只出现一次的一段文本>
find: <锚点内只出现一次的待替换文本>
content: <替换结果；为空表示删除匹配>
insert: |-
  <插入到锚点标记处的文本>
```
````

- **`anchor`**（必需、非空）——`upstream/` 文件中必须恰好出现一次的一段文本，是整个 op 的闸门：锚点仍匹配时，所有编辑自动生效；上游改动它时，构建失败并点名该 op，由人来重新指定。
- **`find` / `content`**——把 `find` 替换为 `content`。`find` 必须在锚点内（去掉标记后）只出现一次；`content` 为空表示删除匹配；`find` 与 `content` 完全相同是空操作，会失败。所有 `find`/`content` 都针对锚点的原始文本解析，所以它们在块内的先后顺序无关紧要，同一 op 内的编辑也不允许重叠。
- **`insert`**——把内容插入到锚点携带 `<oh-my-wayfinder:insert>` 标记的位置，每个锚点最多一个标记。匹配前先去掉标记，因此锚点读起来仍是插入点周围的字面上游文本。有标记却无 insert、或有 insert 却无标记都会失败。
- **块标量**——`field: |` 保留一个结尾换行，`field: |-` 去掉它；短值可以内联（如 `find: on resolution`）。块标量的每一行缩进两个空格。映射文档使用 LF 并以换行结尾。
- **顺序**——同一目标内的 op 按文档顺序、基于前面 op 的结果依次执行。

解析错误——字段缺失或重复、目标不在白名单、`find` 后没有 `content`、op 没有任何编辑、ID 不符合小写 kebab-case、残留 diff-block，以及其他格式问题——都会让构建失败，并指出映射文件位置与 op。提示性警告（`find` 与 `content` 共享词边界上下文、可以收窄）不影响构建结果。

## 锚点与上游内容的保留

- 与该 op 无关的上游文字要留在编辑范围之外，在定位唯一的前提下也留在锚点之外。
- `find` 只覆盖改动本身，不要带上周围语境：过宽的 `find` 不改变构建结果（闸门是锚点），却会把语境重复进 `content`、掩盖这个 op 真正拥有的内容。
- `anchor`/`find` 中的上游文本必须原样保留。Markdown 表格在原始源码中保持列对齐；`content:`/`insert:` 中自拟的表格以及手写 skill 也自行做列对齐。
- fork 新增的选择项按用途命名（例如 `mode`），避免 `branch` 这类容易被误认成 Git 操作的词。
- 所有文件都是 LF：`.gitattributes` 固定 `* text=auto eol=lf`；出现裸 CR 或缺少结尾换行都会让构建失败。

## 命令

```bash
node deltas/build.mjs                         # 重新生成 skills/ 并刷新 deltas/preview.html
node deltas/build.mjs --check                 # 校验已提交的 skills/，不写文件、不刷新预览
node deltas/preview.mjs                       # 只刷新 deltas/preview.html
node deltas/check-upstream.mjs                # 列出与上游 HEAD 有差异的 skill
node deltas/check-upstream.mjs --verbose      # 同时列出有差异的文件
node deltas/check-upstream.mjs --local <dir>  # 与本地上游检出对比
```

**构建（`build.mjs`）**是纯文本处理：不调用 shell、git 或网络。写入式运行还会重新生成预览，预览失败会导致构建失败；`--check` 始终只读，并报告每个文件第一处差异所在的行。构建会归一化 `upstream/` 中的 CRLF（并打印提示），并要求其他所有文件（包括映射）使用 LF 且以换行结尾。

**快照检查（`check-upstream.mjs`）**只比较白名单中的文件，比较前对快照一侧做换行归一化（CRLF → LF）。默认通过 GitHub API 获取 `commits/HEAD` 与递归 tree——每次运行两个未认证请求（每小时 60 次；设置 `GITHUB_TOKEN` 可提高上限）。`--local <dir>` 与本地检出对比，例如 `--local ../mattpocock-skills`，并在报告中标注该检出的 `HEAD`。退出码：`0` 全部一致，`1` 至少一个 skill 有差异，`2` 无法完成比较。上游的预期布局是 `skills/engineering/<skill>`：找到的路径不是它时以 note 提示；上游缺少该 skill 目录或白名单文件时报告为 removed。

**预览（`preview.mjs`）**写出 `deltas/preview.html`（已 gitignore）：一个自包含页面——无服务器、无依赖——把每个 op 显示为从 `upstream/<file>` 到重新生成的 `skills/<file>` 的 GitHub 风格 diff，每个变更块标注产生它的 op；点击标注即可看到该 op 的说明、锚点与编辑。它通过 `deltas/ops.mjs`（与构建同一份代码）重放 op，并与已提交的 `skills/` 文件交叉核对，发现不一致会在页头报告。用它评审映射，不必手工阅读 op 块。

## 更新上游快照

当前快照对应 `mattpocock/skills` 的提交 `f3fc5632f401156837ee3872f14fe33ccf1024ea`。来源信息只记录在这里；快照更新时请一并更新这一行（检查输出会标注它所比较的版本）。

1. 从选定的上游检出中把八个完整 skill 目录复制进 `upstream/`，替换旧快照。多复制文件没有问题：构建会忽略未列入 manifest 的一切。
2. 针对新基线逐条适配映射的锚点与编辑，同时保留上游的修复和 fork 已确认的语义。预期会有 op 因锚点被点名而构建失败——这正是评审点，不是意外。
3. 运行 `node deltas/build.mjs`，然后检查重新生成的差异（预览页面，或 `git diff skills/`）。
4. 运行 `node deltas/build.mjs --check`。
5. 运行 `node deltas/check-upstream.mjs --local <checkout>`，确认快照与你复制的检出一致。
6. 以人工场景演练受影响的流程（见下文）；构建无法告诉你规则是否仍然可用。

**EOF 锚点盲区。** 锚点一直延伸到文件末尾的 op，无法发现上游在该锚点之后追加的文本：锚点仍然只匹配一次，追加的文本会静默地留在替换结果之后。每次更新快照后，都要阅读重新生成的 `skills/` 差异，找出替换之后残留下来的文本——[deltas/mappings/tdd.md](../deltas/mappings/tdd.md) 中的 `completion` op 就是这种锚法。白名单文件被上游删除时，构建会失败。

## 检查不能证明什么

- **`build.mjs --check`** 只证明已提交的 `skills/` 文件恰好等于当前 `upstream/` 快照经映射生成的结果。它不说明快照是否最新，也不说明生成出的规则行为是否正确。
- **`check-upstream.mjs`** 只证明快照与给定上游版本的这些白名单文件一致（做了换行归一化）。它不覆盖白名单之外的文件，也不说明映射是否仍表达 fork 的意图；远端 HEAD 还可能在运行之后继续前进。
- 两项检查都不会把重新生成的文本与 fork 的意图做比较，也不会运行 agent。行为、顺序和面向人的措辞需要**人工场景验证**：演练受影响的流程——例如在临时仓库里跑一遍改动过的流程，阅读 skill 实际做了什么——并像 ADR 那样记录证据。构建检查通过本身并不证明快照是最新的，预览干净也不证明某个 op 仍然拥有正确的行为。

## 相关文档

- [README](../README.cn.md)——仓库定位、安装与流程。
- [与上游的差异](./upstream-differences.cn.md)——fork 改了什么。
- [ADR 0002：带类型、锚点驱动的 op](./adr/0002-typed-anchored-ops.md)——为什么 op 以锚点为闸门；`docs/adr/` 中的其他 ADR 记录具体决策。
- 代码：[manifest](../deltas/manifest.json)、[build.mjs](../deltas/build.mjs)、[ops.mjs](../deltas/ops.mjs)、[check-upstream.mjs](../deltas/check-upstream.mjs)、[preview.mjs](../deltas/preview.mjs)。
