# QQ 农场 Bot 封号风险分析与解决方案

> 分析日期: 2026-05-07
> 基于 38 个后端文件 + 44 个前端文件的全面审查

---

## 一、网络协议层指纹（最易被检测）

### 1. [严重] 所有 bot 用户共享同一设备指纹

**文件**: `core/src/utils/network.js:404-413`

```js
device_info: {
    sys_software: 'iOS 26.2.1',         // 硬编码
    network: 'wifi',                     // 硬编码
    memory: '7672',                      // 硬编码
    device_id: 'iPhone X<iPhone18,3>',   // 所有用户相同
},
```

**风险**: 官方只需按 `device_id` 聚合，就能一次性识别所有 bot 用户。这是最致命的指纹问题。

**解决方案**: 为每个账号生成唯一的设备指纹并持久化：

```js
function generateDeviceInfo() {
    const models = ['iPhone14,2', 'iPhone15,2', 'iPhone16,1', 'iPhone17,1'];
    const iosVersions = ['17.5.1', '18.0.1', '18.2.1', '18.4.1', '26.2.1'];
    const memories = ['4072', '6144', '7672', '8192'];
    return {
        sys_software: `iOS ${iosVersions[Math.floor(Math.random() * iosVersions.length)]}`,
        network: Math.random() > 0.3 ? 'wifi' : '5G',
        memory: memories[Math.floor(Math.random() * memories.length)],
        device_id: `iPhone X<${models[Math.floor(Math.random() * models.length)]}>`,
    };
}
```

---

### 2. [严重] User-Agent 固定 + clientVersion 过时风险

**文件**: `core/src/utils/network.js:530-533`, `core/src/config/config.js:8`

```js
'User-Agent': 'Mozilla/5.0 ... Chrome/132.0.0.0 ... MicroMessenger/7.0.20.1781...'
clientVersion: '1.11.1.7_20260425',  // 固定版本号
```

**风险**:
- 固定 UA + 固定版本号 = 极易被服务端批量匹配
- 当官方发布新版本后，旧版本号本身就是 bot 标志
- `runtime-engine.js:147` 有加载配置机制，但 `clientVersion` 需要用户手动更新

**解决方案**:
- `clientVersion` 应从远程配置自动拉取最新值
- UA 中的 Chrome/MicroMessenger 版本号应动态匹配 `clientVersion` 的更新时间

---

### 3. [严重] WebSocket 连接参数模式一致

**文件**: `core/src/utils/network.js:527`

```js
const url = `${CONFIG.serverUrl}?platform=${CONFIG.platform}&os=${CONFIG.os}&ver=${CONFIG.clientVersion}&code=${savedCode}&openID=`;
```

**风险**: `openID=` 始终为空，且连接参数格式固定。真实小程序可能有不同的连接参数模式。

**解决方案**: 根据平台类型动态调整连接参数，模拟真实小程序的连接行为。

---

## 二、行为时序指纹（最容易被统计分析检测）

### 4. [严重] 巡田间隔完全固定 — 从未使用随机区间

**文件**: `core/src/services/farm.js:1646-1651`

```js
function scheduleNextFarmCheck(delayMs = CONFIG.farmCheckInterval) {
    // ...
    scheduleNextFarmCheck(CONFIG.farmCheckInterval);  // 始终使用固定 3000ms
}
```

**问题**: 虽然 `config.js:21-24` 定义了 `farmCheckIntervalMin(3000)` 和 `farmCheckIntervalMax(5000)`，但 `scheduleNextFarmCheck` **从未使用这些区间**，始终传入固定值 `3000ms`。

**风险**: 服务端统计请求时间间隔的方差，精确 3 秒间隔的账号一查一个准。

**解决方案**:

```js
function scheduleNextFarmCheck(delayMs) {
    if (!farmLoopRunning) return;
    const actualDelay = delayMs || randomInRange(CONFIG.farmCheckIntervalMin, CONFIG.farmCheckIntervalMax);
    farmScheduler.setTimeoutTask('farm_check_loop', actualDelay, async () => {
        if (!farmLoopRunning) return;
        await checkFarm();
        if (!farmLoopRunning) return;
        scheduleNextFarmCheck(); // 不传参数，使用随机间隔
    });
}
```

---

### 5. [严重] 好友巡查间隔固定 + 操作间隔过窄

**文件**: `core/src/services/friend.js:1752`, `friend.js:1303,1312,1617,1655`

```js
// 循环间隔固定 12000ms
friendScheduler.setTimeoutTask('friend_check_loop', Math.max(0, CONFIG.friendCheckInterval), ...);

// 好友内操作间隔 500-800ms（太快太窄）
await randomDelay(500, 800);   // 出现 10+ 次
```

**风险**: 好友循环也是固定间隔。且 500-800ms 的操作间隔范围过窄，正常人操作波动更大。

**解决方案**:
- 好友内操作改为 `randomDelay(800, 2500)`
- 每 5-10 个好友插入 8-20s 长停顿
- 好友循环间隔使用 `friendCheckIntervalMin` ~ `friendCheckIntervalMax` 的随机值

---

### 6. [严重] 种植/施肥固定 50ms 间隔

**文件**: `core/src/services/farm.js:107,588`

```js
if (landIds.length > 1) await sleep(50);  // 固定 50ms
```

**风险**: 毫秒级精确的批量操作，人类不可能做到。

**解决方案**: 改为 `randomDelay(80, 350)`。

---

### 7. [高] 心跳间隔精确 25 秒无抖动

**文件**: `core/src/config/config.js:18`, `core/src/utils/network.js:483`

```js
heartbeatInterval: 25000,  // 固定 25s
networkScheduler.setIntervalTask('heartbeat_interval', CONFIG.heartbeatInterval, ...);
```

**风险**: 心跳是最基础的网络指纹，固定 25 秒精确心跳非常可疑。

**解决方案**: 使用 `setIntervalTask` + 每次实际执行时添加 ±3s 随机抖动，或在心跳发送前 `await randomDelay(0, 3000)`。

---

## 三、行为模式指纹

### 8. [严重] 24/7 不间断在线

**文件**: `core/src/services/friend.js:441-453`

```js
if (!cfg || !cfg.enabled) return false;  // 静默时段默认关闭
```

**风险**:
- 农场巡田（3 秒）24 小时不停，凌晨 2-5 点的操作是最明显的 bot 特征
- 好友静默时段**默认关闭**，且农场巡田根本没有静默时段功能

**解决方案**:
1. 农场巡田也添加静默时段功能
2. 将好友静默时段**默认启用**（如 1:00-7:00）
3. 在静默时段前逐渐降低频率，模拟"人要去睡觉"

---

### 9. [高] 偷菜行为过于贪婪和规律

**文件**: `core/src/services/friend.js:1593`

```js
stealFriends.sort((a, b) => b.stealNum - a.stealNum);  // 按最优排序
```

**风险**:
- 每次都精确按可偷数量降序排序（数学最优）
- 100% 偷取所有可偷作物，从不遗漏
- 作物成熟后立即偷取（巡田间隔只有 3 秒）

**解决方案**:
- 随机打乱偷菜顺序，而非按最优排序
- 添加随机跳过概率（如 10-20% 概率跳过某些好友）
- 收到推送后不立即检查，添加 30-120s 随机延迟

---

### 10. [高] 推送响应过于即时

**文件**: `core/src/services/farm.js:1678-1680`

```js
farmScheduler.setTimeoutTask('farm_push_check', 100, async () => {  // 固定 100ms 后检查
    if (!isCheckingFarm) await checkFarm();
});
```

**风险**: 收到服务器推送后固定 100ms 就发起请求，真实用户至少需要几百毫秒到几秒的反应时间。

**解决方案**: 改为 `randomDelay(2000, 8000)` 模拟人类反应时间。

---

### 11. [高] 操作完整性 — 从不失败

**文件**: 整个 `farm.js` + `friend.js`

**风险**: 真实玩家偶尔会忘记浇水、错过收获时间、操作失误。Bot 永远 100% 完成所有操作，从不遗漏。这种"完美操作率"本身就是指纹。

**解决方案**: 可选的"随机遗漏率"配置，如 2-5% 概率跳过某些非关键操作。

---

## 四、协议层问题

### 12. [中] client_seq 从 1 开始严格递增

**文件**: `core/src/utils/network.js:32,121-122`

```js
let clientSeq = 1;
const seq = clientSeq;
clientSeq += 1;
```

**风险**: 真实客户端在页面刷新、重连后序列号会跳号或重置。

**解决方案**: 登录时从随机初始值（5-100）开始。

---

### 13. [中] 重连间隔固定 2 秒

**文件**: `core/src/utils/network.js:551`

```js
networkScheduler.setTimeoutTask('auto_reconnect', 2000, () => { ... });
```

**风险**: 断线后固定 2 秒重连，真实小程序会有指数退避和随机抖动。

**解决方案**: 使用指数退避 + 随机抖动（2s → 4s → 8s → 16s，上限 60s）。

---

### 14. [中] 好友列表分批请求间隔过短

**文件**: `core/src/services/friend.js:399`

```js
await randomDelay(500, 1000);  // 每批好友只间隔 0.5-1s
```

**风险**: 真实小程序一次加载所有好友，不会分批高密度请求。

**解决方案**: 增大批次间隔到 2-5s。

---

## 五、后端审查发现的关联风险

### 15. [中] `pendingCallbacks.size >= 5` 硬限制导致操作中断

**文件**: `core/src/utils/network.js:148`

**风险**: 高频操作时（施肥循环、偷菜循环）可能因并发请求超过 5 个被拒绝，导致操作模式出现"规律性失败→重试"的异常模式。

**解决方案**: 适当提高限制到 10-15，或按操作类型设置不同限制。

---

### 16. [中] 有机肥循环可能无限执行

**文件**: `core/src/services/farm.js:116-142`

**风险**: `fertilizeOrganicLoop` 的 `while(true)` 只在请求失败时退出，如果服务器持续返回成功，会产生异常高频请求模式。

**解决方案**: 添加最大循环次数限制（如 `maxIterations = landIds.length * 3`），以及单次循环超时机制。

---

## 风险优先级总表

| 优先级 | # | 问题 | 检测难度 | 修复难度 |
|--------|---|------|----------|----------|
| **P0** | 1 | 设备指纹所有用户一致 | 极低 | 低 |
| **P0** | 4 | 巡田间隔固定 3s 从未随机化 | 极低 | 极低 |
| **P0** | 5 | 好友操作间隔过窄 (500-800ms) | 低 | 低 |
| **P0** | 6 | 种植/施肥固定 50ms | 低 | 极低 |
| **P0** | 8 | 24/7 不间断在线 | 低 | 中 |
| **P1** | 2 | UA/版本号固定且可能过时 | 低 | 低 |
| **P1** | 7 | 心跳间隔无抖动 | 中 | 低 |
| **P1** | 9 | 偷菜行为过于贪婪 | 中 | 中 |
| **P1** | 10 | 推送响应过于即时 (100ms) | 中 | 极低 |
| **P2** | 3 | WebSocket 连接参数模式 | 中 | 低 |
| **P2** | 11 | 操作从不失败/遗漏 | 高 | 中 |
| **P2** | 12 | client_seq 严格递增 | 高 | 极低 |
| **P2** | 13 | 重连间隔固定 | 中 | 低 |
| **P2** | 14 | 好友分批请求间隔过短 | 中 | 低 |
| **P3** | 15 | 并发请求硬限制 | 低 | 低 |
| **P3** | 16 | 有机肥循环可能无限 | 中 | 低 |

---

## 核心建议

### 最高性价比的改动（改几行代码就能大幅降低风险）

1. **`farm.js` `scheduleNextFarmCheck`**: 传入 `randomInRange(3000, 5000)` 代替固定值
2. **`friend.js` `friendCheckLoop`**: 同上使用 `randomInRange(12000, 15000)`
3. **`farm.js` 种植/施肥**: `sleep(50)` → `randomDelay(80, 350)`
4. **`friend.js` 好友操作**: `randomDelay(500, 800)` → `randomDelay(800, 2500)`
5. **`network.js` 设备信息**: 从账号配置中读取而非硬编码
6. **`farm.js` 推送响应**: `setTimeoutTask(..., 100, ...)` → `setTimeoutTask(..., randomInRange(2000, 8000), ...)`

---

## 附录：代码审查发现的其他问题

以下问题不直接导致封号，但可能影响项目稳定性或安全性：

### 安全问题

- **默认管理员密码 `admin/admin`** (`user-store.js:335`): 用户未修改则系统完全暴露
- **SSRF 漏洞** (`admin.js:2361-2402`): `/api/proxy` 端点可转发请求到任意 URL
- **Token 无过期机制** (`admin.js:33-36`): 登录令牌永不过期，可无限累积
- **前端 Token 明文存储在 localStorage** (`stores/user.ts:50`): XSS 攻击可窃取
- **前端 wx-login API Key 暴露** (`stores/wx-login.ts:109-119`): 浏览器开发者工具可查看

### 稳定性问题

- **`user-store.js` 每次操作都读文件**: `loadUsers()` 使用 `fs.readFileSync` 同步读取，阻塞事件循环
- **`store.js` 读写竞争**: `saveGlobalConfig` 的读-改-写操作不是原子的
- **有机肥 `while(true)` 无上限**: `fertilizeOrganicLoop` 可能无限循环
- **`process.exit(0)` 登录失败退出**: `network.js:422` 退出码 0 误导父进程

### 性能问题

- **`syncStatus` 每 3 秒 JSON.stringify 整个状态对象** (`worker.js:781`): 高频序列化开销大
- **`getAccountConfigSnapshot` 每次深拷贝整个配置** (`store.js`): GC 压力大
- **前端 Settings 页面每 3 秒轮询账号列表** (`views/Settings.vue:109-111`): 冗余 HTTP 请求
- **前端 Sidebar 每秒重渲染** (`Sidebar.vue:36-37`): `useNow()` 导致不必要的更新

### 代码质量问题

- **`getDateKey()` 复制粘贴 6+ 次**: `email.js`, `monthcard.js`, `share.js`, `qqvip.js`, `mall.js`, `worker.js`
- **`mall.js:162` 引用未定义变量 `type`**: 运行时将抛出 ReferenceError
- **前端主题定义重复**: `main.ts` 和 `stores/app.ts` 各维护一份主题配置
- **前端 `allLogs` 计算属性映射后立即过滤掉**: `Dashboard.vue:31-42` 的 account log 映射是死代码
