# GameStart 跨平台 Docker 部署与远程 ComfyUI 完整方案

> 适用项目：`lark-x/GameStart`
>
> 目标环境：
> - macOS + Docker Desktop
> - Windows + Docker Desktop
> - Windows + WSL2 + Docker Desktop WSL Integration
>
> 外部生成服务：
> - ComfyUI 与 GameStart 同机
> - ComfyUI 位于局域网另一台 Windows 主机
>
> 本方案结合当前 PR #43 / #44 / #45 的方向，最终目标是：**容器内部端口固定、宿主机只暴露 Web、Web 端口自动选择、部署完成自动输出真实访问地址，同时可靠支持 Mac/Windows/WSL 以及远程 ComfyUI。**

---

## 1. 最终目标

普通部署：

```bash
pnpm deploy
```

默认使用本机模式：

```text
127.0.0.1
```

需要局域网访问：

```bash
pnpm deploy -- --mode lan
```

部署工具自动完成：

```text
检测运行环境
→ 检查 Docker / Compose
→ 检查配置
→ 选择可用 Web 端口
→ 构建镜像
→ 启动 Redis / API / Worker / Web
→ 等待 Health Check
→ 验证 Web → Nginx → API
→ 查询 Docker 实际发布端口
→ 识别 Local / LAN 地址
→ 检测 ComfyUI（如果已配置）
→ 输出最终访问地址
```

用户不再因为 `4173`、`3003`、`6379` 被占用而修改项目代码或 Compose。

---

## 2. 核心端口策略

最终固定：

| 服务 | Container Port | Host Port |
|---|---:|---:|
| Web / Nginx | 80 | 动态 |
| API | 3003 | 不暴露 |
| Redis | 6379 | 不暴露 |
| Worker | 无 | 不暴露 |

其中：

```text
80 / 3003 / 6379
```

属于内部契约，不能因为宿主机端口冲突而改变。

只有 Web 的 Host Port 属于部署参数。

---

## 3. 最终 Docker 网络

```text
Browser
   │
   │ Host :18xxx
   ▼
Web / Nginx :80
   │
   │ /api/v2/*
   ▼
API :3003
   │
   ▼
Redis :6379

Worker
 ├─ API
 └─ Redis
```

容器内部统一使用：

```text
api:3003
redis:6379
```

不要使用：

```text
127.0.0.1:3003
127.0.0.1:6379
```

---

## 4. 当前 PR 的最终处理方式

### PR #43

职责：

```text
Compose 网络边界
```

只处理：

- Redis `ports → expose`
- API `ports → expose`
- Web 保留唯一 Published Port
- Dev Overlay 用于调试时临时暴露 Redis / API
- Compose 网络相关测试

建议：**优先合并。**

### PR #44

已被 #45 包含。

建议直接关闭：

```text
Superseded by #45
```

### PR #45

重新定位为：

```text
Cross-platform Deployment Tool
```

在合并前完成本文所有 P0/P1 整改。

---

## 5. 推荐生产 Compose

```yaml
services:
  redis:
    image: redis:7.2-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    expose:
      - "6379"

  api:
    restart: unless-stopped
    environment:
      V2_API_HOST: 0.0.0.0
      V2_API_PORT: 3003
      REDIS_URL: redis://redis:6379
    expose:
      - "3003"
    depends_on:
      redis:
        condition: service_healthy

  worker:
    restart: unless-stopped
    environment:
      REDIS_URL: redis://redis:6379
    depends_on:
      api:
        condition: service_healthy
      redis:
        condition: service_healthy

  web:
    restart: unless-stopped
    ports:
      - target: 80
        published: "${WEB_PORT:-4173}"
        host_ip: "${WEB_HOST_BIND:-127.0.0.1}"
        protocol: tcp
    depends_on:
      api:
        condition: service_healthy
```

---

## 6. 开发 Overlay

`infra/compose/docker-compose.dev.yml`：

```yaml
services:
  redis:
    ports:
      - "${REDIS_DEV_PORT:-6379}:6379"

  api:
    ports:
      - "${API_DEV_PORT:-3003}:3003"
```

这样调试模式也允许自行覆盖宿主机端口，而正式部署完全不需要 API / Redis Host Port。

---

## 7. 三种正式支持环境

### macOS

```text
macOS
+ Docker Desktop
+ Node
+ pnpm
```

支持：

```bash
pnpm deploy
pnpm deploy -- --mode lan
```

### Windows

```text
Windows
+ Docker Desktop
+ PowerShell
+ Node
+ pnpm
```

支持：

```powershell
pnpm deploy
pnpm deploy -- --mode lan
```

### Windows + WSL2

推荐：

```text
Windows
+ Docker Desktop WSL2 Backend
+ Docker Desktop WSL Integration
+ Ubuntu WSL
```

WSL 中：

```bash
pnpm deploy
```

不建议同时维护 WSL 内独立 `dockerd`。

---

## 8. Deploy Environment Detection

新增：

```ts
type DeployEnvironment =
  | "macos-docker-desktop"
  | "windows-docker-desktop"
  | "wsl-docker-desktop"
  | "linux-docker"
  | "unknown";
```

检测：

```text
process.platform
os.release()
docker version
docker info
docker context show
```

WSL：

```ts
const isWsl =
  process.platform === "linux"
  && /microsoft|wsl/i.test(os.release());
```

---

## 9. Windows 跨平台兼容：必须整改

禁止使用：

```bash
WEB_PORT=18003 docker compose up -d
```

因为这是 POSIX Shell 写法。

统一改为 Node 直接传环境变量：

```ts
execFileSync(
  "docker",
  [
    "compose",
    "-f",
    COMPOSE_FILE,
    "up",
    "-d",
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      WEB_PORT: String(webPort),
      WEB_HOST_BIND: hostBind,
    },
  },
);
```

---

## 10. Docker 命令统一封装

建议：

```ts
function dockerCompose(
  args: readonly string[],
  extraEnv: Record<string, string> = {},
) {
  return execFileSync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ...extraEnv,
      },
    },
  );
}
```

所有：

```text
build
up
down
logs
ps
port
config
```

都走统一 Wrapper。

---

## 11. Local / LAN 模式

默认：

```bash
pnpm deploy
```

等价：

```bash
pnpm deploy -- --mode local
```

设置：

```text
WEB_HOST_BIND=127.0.0.1
```

LAN：

```bash
pnpm deploy -- --mode lan
```

设置：

```text
WEB_HOST_BIND=0.0.0.0
```

这样不会默认把 GameStart 暴露给整个局域网。

---

## 12. Web Port 自动选择

默认范围：

```text
18000～18999
```

优先级：

```text
CLI --port
→ .env WEB_PORT
→ deployment.json 上次成功端口
→ 自动扫描 18000～18999
```

显式指定：

```bash
pnpm deploy -- --port 18888
```

如果 18888 被占用：

```text
直接失败
```

不要偷偷改成 18889。

自动模式才允许自动选择下一个可用端口。

---

## 13. Port Check

使用 Node：

```text
node:net
```

不要依赖：

```text
lsof
ss
netstat
```

避免平台差异。

---

## 14. Port Race Retry

允许：

```text
MAX_PORT_RETRIES=5
```

但仅在 Docker 错误明确属于：

```text
address already in use
port is already allocated
Bind for ... failed
Ports are not available
```

时换端口重试。

如果是：

```text
permission denied
compose syntax error
disk full
volume error
image error
```

立即失败。

---

## 15. Build 只执行一次

正确流程：

```text
Build
→ Up
→ 如果仅端口冲突
→ 换端口
→ Up
```

不要每次换端口都重新 Build。

---

## 16. Deployment Lock

保留：

```text
.data/deploy.lock
```

推荐内容：

```json
{
  "pid": 12345,
  "startedAt": "2026-08-19T10:00:00Z"
}
```

最好同时检查：

```text
PID 是否仍存在
```

不要仅依赖文件 10 分钟是否过期。

---

## 17. 禁止 process.exit 绕过锁释放

不要：

```ts
function die() {
  process.exit(1);
}
```

改为：

```ts
class DeploymentError extends Error {}

function fail(message: string): never {
  throw new DeploymentError(message);
}
```

顶层：

```ts
const release = acquireLock();

try {
  await deploy();
} finally {
  release();
}
```

最后：

```ts
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

---

## 18. Runtime State

保存：

```text
.data/deployment.json
```

例如：

```json
{
  "version": 1,
  "environment": "macos-docker-desktop",
  "mode": "lan",
  "webPort": 18003,
  "hostBind": "0.0.0.0",
  "deployedAt": "2026-08-19T10:00:00Z"
}
```

同时加入：

```gitignore
.data/
```

---

## 19. deployment.json 不是事实来源

最终实际 Web Port 必须查询：

```bash
docker compose port web 80
```

`deployment.json` 只用于：

```text
记录上次配置
优先复用端口
显示 Last Known State
```

---

## 20. Compose 不要强制 WEB_PORT 必填

不要：

```yaml
"${WEB_PORT:?WEB_PORT is required}:80"
```

否则：

```text
deploy:status
deploy:logs
deploy:stop
```

可能因为缺少环境变量无法解析 Compose。

推荐：

```yaml
published: "${WEB_PORT:-4173}"
```

Deploy Tool 再通过 Process Env 覆盖。

---

## 21. Health Check

部署成功至少要求：

```text
Redis healthy
API healthy
Worker running
Web healthy
```

还必须验证：

```text
GET /
GET /api/v2/health
GET /api/v2/ready
```

全部成功。

---

## 22. `/health` 与 `/ready` 必须是 Critical

如果 Web 首页正常但：

```text
Web → Nginx → API
```

失败，仍属于部署失败。

不能显示：

```text
Deployment completed successfully
```

---

## 23. Failed Service Logs

例如 API 未健康：

```bash
docker compose logs --tail=80 api
```

自动输出。

Worker 失败：

```bash
docker compose logs --tail=80 worker
```

这样用户不用自己找排查命令。

---

## 24. deploy:status

```bash
pnpm deploy:status
```

必须直接查询 Docker：

```text
Redis
API
Worker
Web
```

实际端口：

```bash
docker compose port web 80
```

然后输出 Local / LAN / API URL。

---

## 25. deploy:logs

支持：

```bash
pnpm deploy:logs
```

以及：

```bash
pnpm deploy:logs -- api
pnpm deploy:logs -- worker
pnpm deploy:logs -- web
```

---

## 26. deploy:stop

```bash
pnpm deploy:stop
```

只执行：

```text
docker compose down
```

默认绝不能：

```text
down -v
```

---

## 27. deploy:doctor

建议新增：

```bash
pnpm deploy:doctor
```

只检测、不部署：

```text
Node
pnpm
Docker
Docker Compose
Docker Engine
Docker Context
Port Range
LAN IP
.env
WSL 状态
ComfyUI
```

---

# 28. macOS 部署

本机：

```bash
pnpm deploy
```

输出：

```text
Environment
macOS / Docker Desktop

Mode
Local

Local
http://127.0.0.1:18003
```

局域网：

```bash
pnpm deploy -- --mode lan
```

假设 Mac：

```text
192.168.1.20
```

输出：

```text
Local
http://127.0.0.1:18003

LAN
http://192.168.1.20:18003
```

Windows 直接访问：

```text
http://192.168.1.20:18003
```

---

## 29. Windows Docker Desktop 部署

PowerShell：

```powershell
pnpm deploy
```

LAN：

```powershell
pnpm deploy -- --mode lan
```

例如：

```text
Windows
192.168.1.30
```

输出：

```text
Local
http://127.0.0.1:18004

LAN
http://192.168.1.30:18004
```

LAN 模式下可能需要 Windows Firewall 放行实际 Web Host Port。

Deploy Tool 只提示，不自动修改防火墙。

---

## 30. WSL + Docker Desktop 部署

推荐代码位于：

```text
~/apps/GameStart
```

而不是长期运行在：

```text
/mnt/c/...
```

执行：

```bash
pnpm deploy -- --mode lan
```

---

## 31. WSL LAN 地址处理

WSL 自己的：

```text
networkInterfaces()
```

可能返回：

```text
172.x.x.x
```

这通常不是局域网其他设备该访问的地址。

WSL 模式下应该：

```text
调用 powershell.exe
→ 读取 Windows 活跃网卡 IPv4
```

然后输出：

```text
Windows Host
192.168.1.30

LAN
http://192.168.1.30:18005
```

不要把 WSL NAT IP 作为主要 LAN 地址。

---

# 32. ComfyUI：Mac GameStart 调 Windows ComfyUI

完全支持。

示例：

```text
Mac
GameStart Docker
192.168.1.20

Windows
ComfyUI
192.168.1.50:8188
```

GameStart 设置：

```text
设置
→ ComfyUI
→ http://192.168.1.50:8188
```

---

## 33. Windows ComfyUI 必须允许 LAN

ComfyUI 启动：

```bash
python main.py --listen 0.0.0.0 --port 8188
```

不要只监听：

```text
127.0.0.1
```

否则 Mac 无法访问。

---

## 34. Windows Firewall

允许：

```text
TCP 8188
Private Network
```

最好进一步限制：

```text
RemoteAddress
```

为 Mac IP 或局域网网段。

不要把 8188 做公网 Port Forward。

---

## 35. GameStart 为什么不能填 localhost

GameStart API 在 Docker Container 中。

因此：

```text
127.0.0.1
localhost
```

指的是：

```text
API Container 自己
```

不是 Windows ComfyUI。

远程机器必须填写：

```text
http://<Windows-LAN-IP>:8188
```

---

## 36. 同机 ComfyUI

如果：

```text
Windows Docker Desktop
+
Windows 本机 ComfyUI
```

推荐：

```text
http://host.docker.internal:8188
```

Mac Docker + Mac 本机 ComfyUI 同理。

---

## 37. 三种 ComfyUI 地址规则

### 远程机器

```text
http://192.168.1.50:8188
```

### Docker Host 本机

```text
http://host.docker.internal:8188
```

### 未来同 Compose Service

```text
http://comfyui:8188
```

---

## 38. ComfyUI Connection Test

保留后端：

```text
GET <baseUrl>/system_stats
```

作为连接检测。

必须明确：

```text
连接测试由 GameStart API 发起
```

真正网络关系是：

```text
GameStart API Container
→ ComfyUI
```

而不是浏览器直接访问 ComfyUI。

---

## 39. ComfyUI 不应阻断 GameStart 核心部署

ComfyUI 属于：

```text
Optional Capability
```

因此：

```text
GameStart Core 全部健康
ComfyUI 失败
```

最终应：

```text
Deployment Success
+
Warning
```

不能：

```text
Deployment Failed
```

---

## 40. ComfyUI Settings 下一阶段增强

建议新增：

```text
Endpoint
Connection Source
Status
Latency
Last Checked
Error Category
```

例如：

```text
ComfyUI

Endpoint
http://192.168.1.50:8188

Source
GameStart API Container

Status
Connected

Latency
12 ms
```

错误至少区分：

```text
DNS_ERROR
CONNECTION_REFUSED
TIMEOUT
HTTP_ERROR
INVALID_RESPONSE
```

---

## 41. localhost 智能提示

如果用户在 ComfyUI 设置里输入：

```text
localhost
127.0.0.1
```

UI 提示：

```text
GameStart API 运行在 Docker 容器中。
如果 ComfyUI 运行在 Docker Host，请使用 host.docker.internal；
如果运行在另一台机器，请使用该机器的局域网 IP。
```

---

## 42. 部署完成输出

Mac LAN 示例：

```text
────────────────────────────────────────
 GameStart Deployment
────────────────────────────────────────

Environment
macOS / Docker Desktop

Mode
LAN

Status

✓ Redis
✓ API
✓ Worker
✓ Web
✓ Reverse Proxy

Access

Local
http://127.0.0.1:18003

LAN
http://192.168.1.20:18003

API
http://192.168.1.20:18003/api/v2

External Services

✓ ComfyUI
  http://192.168.1.50:8188

Internal

Web
:80

API
api:3003

Redis
redis:6379

────────────────────────────────────────
Deployment completed successfully.
────────────────────────────────────────
```

---

## 43. WSL 输出示例

```text
Environment
WSL2 / Docker Desktop

Docker Host
Windows

Mode
LAN

Local
http://127.0.0.1:18005

LAN
http://192.168.1.30:18005
```

---

## 44. deploy:doctor 示例

```text
GameStart Deployment Doctor

Environment
✓ WSL2
✓ Docker Desktop Integration
✓ Docker Engine reachable

Networking
✓ Port range 18000-18999 available
✓ Windows Host 192.168.1.30

Configuration
✓ .env readable

External Services
✓ ComfyUI 192.168.1.50:8188

Ready to deploy.
```

---

## 45. Deploy Tool 模块化

建议：

```text
scripts/deploy/
├── cli.mjs
├── docker.mjs
├── environment.mjs
├── network.mjs
├── port.mjs
├── health.mjs
├── state.mjs
├── lock.mjs
└── output.mjs
```

`scripts/deploy.mjs` 只负责 orchestration。

---

## 46. 必须测试的纯逻辑

至少：

```text
parseArgs
selectPort
parseDockerPublishedPort
detectWSL
detectEnvironment
classifyDockerError
loadState
saveState
lock cleanup
LAN address selection
ComfyUI endpoint hints
```

---

## 47. CI 平台矩阵

Deploy Tool Unit Test 建议：

```text
ubuntu-latest
windows-latest
macos-latest
```

重点防止：

```text
Mac / Linux 正常
Windows Shell 失败
```

---

## 48. Docker Smoke Test

在：

```text
main
workflow_dispatch
```

执行真实 Docker Smoke。

测试：

```text
先占用 18000
先占用 18001

pnpm deploy

最终应选择 >=18002
```

---

## 49. 显式端口测试

占用：

```text
18888
```

执行：

```bash
pnpm deploy -- --port 18888
```

必须失败。

---

## 50. Lock Cleanup Test

模拟：

```text
Docker daemon unavailable
```

部署失败后：

```text
.data/deploy.lock
```

必须被清理。

---

## 51. Status Test

部署成功后：

```bash
pnpm deploy:status
```

即使当前 Shell 没有：

```text
WEB_PORT
```

也必须正常。

---

## 52. Mac 实机验收

至少：

```text
Local
LAN
Auto Port
Explicit Port
Port Conflict
Status
Stop
Restart
Windows Remote ComfyUI
```

---

## 53. Windows 实机验收

至少：

```text
PowerShell
Docker Desktop
Local
LAN
Auto Port
Explicit Port
Status
Stop
Firewall
Local / Remote ComfyUI
```

---

## 54. WSL 实机验收

至少：

```text
Ubuntu WSL
Docker Desktop Integration
Local
LAN
Windows Host IP
Auto Port
Status
Stop
Remote ComfyUI
```

---

## 55. README 最终结构

建议：

```text
Docker Deployment
├── Quick Start
├── macOS
├── Windows
├── WSL
├── Local Mode
├── LAN Mode
├── Deployment Commands
├── Remote ComfyUI
└── Troubleshooting
```

---

## 56. README 不再要求手工改端口

删除：

```text
如果端口冲突，请修改 4173 / 3003 / 6379
```

替换成：

```text
GameStart automatically selects a free Web host port.
```

内部端口明确说明：

```text
Web 80
API 3003
Redis 6379

These are container-internal ports and normally should not be changed.
```

---

# 57. 最终 PR 执行顺序

```text
1. Review latest main

2. Merge PR #43

3. Close PR #44
   Superseded by #45

4. Rebase PR #45

5. Replace shell-string Docker commands
   with execFileSync

6. Implement true Local / LAN host binding

7. Restore safe WEB_PORT Compose fallback

8. Fix deployment lock cleanup

9. Fix retry classification

10. Build once, retry up only

11. Ignore .data

12. Make /health and /ready critical

13. Implement Mac / Windows / WSL environment detection

14. Implement WSL Windows-host LAN IP detection

15. Improve deploy:status / logs / stop

16. Add deploy:doctor

17. Add cross-platform deploy unit tests

18. Mac real deployment test

19. Windows Docker Desktop real deployment test

20. WSL + Docker Desktop real deployment test

21. Merge PR #45

22. Create separate ComfyUI network diagnostics PR
```

---

# 58. Definition of Done：Networking

```text
[ ] Redis 不发布 Host Port
[ ] API 不发布 Host Port
[ ] Web 是唯一 Published Service
[ ] Web Container Port = 80
[ ] API Container Port = 3003
[ ] Redis Container Port = 6379
[ ] Nginx → api:3003
```

---

# 59. Definition of Done：Port

```text
[ ] 自动范围 18000-18999
[ ] 显式端口冲突明确失败
[ ] 自动端口冲突自动切换
[ ] 只有 bind conflict 才 retry
[ ] Build 只执行一次
[ ] 最终端口来自 docker compose port
```

---

# 60. Definition of Done：macOS

```text
[ ] Docker Desktop
[ ] pnpm deploy
[ ] Local
[ ] LAN
[ ] 正确 Mac LAN IP
[ ] Windows 可访问 Mac GameStart
[ ] Remote Windows ComfyUI
```

---

# 61. Definition of Done：Windows

```text
[ ] PowerShell 可运行
[ ] 不依赖 POSIX Shell 环境变量写法
[ ] Docker Desktop
[ ] Local
[ ] LAN
[ ] 正确 Windows LAN IP
[ ] deploy:status
[ ] deploy:stop
```

---

# 62. Definition of Done：WSL

```text
[ ] WSL2 检测
[ ] Docker Desktop Integration
[ ] 不依赖 WSL 独立 dockerd
[ ] pnpm deploy
[ ] 输出 Windows Host LAN IP
[ ] 不把 WSL NAT IP 当主 LAN 地址
[ ] deploy:status
[ ] deploy:stop
```

---

# 63. Definition of Done：ComfyUI

```text
[ ] 远程 Windows LAN IP 可配置
[ ] 同机 host.docker.internal 可配置
[ ] localhost 有明确提示
[ ] API Container 发起连接测试
[ ] /system_stats 测试
[ ] timeout 可识别
[ ] connection refused 可识别
[ ] ComfyUI 不可用不会阻止 GameStart Core 部署
```

---

# 64. 最终架构

```text
                     LAN
                      │
          ┌───────────┴────────────┐
          │                        │
          ▼                        ▼
 GameStart Host                Windows GPU PC
 Mac / Windows / WSL            ComfyUI :8188
          │
          ▼
       Docker
          │
          ▼
      Web :80
          │
          ▼
     API :3003
          │
          ▼
    Redis :6379
```

GameStart Host 对外只有：

```text
Web :18xxx
```

ComfyUI 独立：

```text
Windows :8188
```

---

# 65. 最终原则

不要再使用：

```text
端口冲突
→ 修改项目默认端口
```

解决部署问题。

正式方案是：

```text
Container Port 固定
+
Web Host Port 动态
+
跨平台 Deploy Tool 自动管理
```

Mac、Windows、WSL 全部使用同一套 Node Deployment Tool。

ComfyUI 作为外部服务，通过：

```text
远程机器
→ LAN IP

同 Docker Host
→ host.docker.internal

未来同 Compose
→ comfyui:8188
```

接入。

最终用户只需要关心：

```text
GameStart 最终访问 URL
ComfyUI Endpoint
```

不再需要理解和维护：

```text
API Host Port
Redis Host Port
Compose 内部端口
WSL NAT
端口冲突
Docker Service DNS
```

这就是 GameStart 当前最适合长期维护的跨平台部署体系。
