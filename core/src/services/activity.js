/**
 * 活动自动管理 - 自动获取最新活动、刷新种子、购买种子
 */

const { sendMsgAsync, getUserState } = require('../utils/network');
const { types } = require('../utils/proto');
const { toNum, log, logWarn, sleep, randomDelay } = require('../utils/utils');
const { createScheduler } = require('./scheduler');

// ============ 常量定义 ============
const ACTIVITY_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5分钟检查一次活动
const REFRESH_COOLDOWN_MS = 2 * 60 * 1000; // 每次刷新间隔2分钟
const ACTIVITY_LOG_MODULE = 'activity';

// ============ 内部状态 ============
let activityLoopRunning = false;
let lastActivityCheckAt = 0;
let lastRefreshAt = 0;
let lastActivityData = null;
let lastRefreshResult = null;
let activityScheduler = null;

const REFRESH_STATE = {
    // 记录每���活动的刷新次数统计 {activityId: {used: X, total: Y, lastRefreshAt: timestamp}}
    refreshStats: new Map(),
    // 记录已购买的种子 {seedId: count}
    purchasedSeeds: new Map(),
};

// ============ 工具函数 ============

function getDateKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * 解析活动刷新限制信息
 * @param {object} activity 活动对象
 * @returns {{remaining: number, total: number, canRefresh: boolean}}
 */
function parseRefreshLimit(activity) {
    if (!activity) {
        return { remaining: 0, total: 0, canRefresh: false };
    }

    // 根据游戏返回的字段解析刷新限制
    const refreshLimit = toNum(activity.refresh_limit || 0);
    const refreshRemaining = toNum(activity.refresh_remaining || 0);

    return {
        remaining: Math.max(0, refreshRemaining),
        total: Math.max(0, refreshLimit),
        canRefresh: refreshRemaining > 0,
    };
}

/**
 * 解析活动种子列表
 * @param {object} activity 活动对象
 * @returns {Array}
 */
function parseActivitySeeds(activity) {
    if (!activity) return [];

    const seeds = Array.isArray(activity.seeds) ? activity.seeds : [];
    return seeds.map((seed) => ({
        seedId: toNum(seed.seed_id || 0),
        seedName: String(seed.seed_name || ''),
        price: toNum(seed.price || 0),
        available: toNum(seed.available || 0),
        stock: toNum(seed.stock || 0),
    })).filter(s => s.seedId > 0);
}

/**
 * 获取活动信息
 */
async function getActivityInfo() {
    try {
        const body = types.GetActivityInfoRequest.encode(
            types.GetActivityInfoRequest.create({})
        ).finish();
        const { body: replyBody } = await sendMsgAsync(
            'gamepb.activitypb.ActivityService',
            'GetActivityInfo',
            body
        );
        const reply = types.GetActivityInfoReply.decode(replyBody);
        return reply;
    } catch (err) {
        logWarn(ACTIVITY_LOG_MODULE, `获取活动信息失败: ${err.message}`, {
            event: 'get_activity_info_error',
            error: err.message,
        });
        return null;
    }
}

/**
 * 刷新活动种子列表
 * @param {number} activityId 活动ID
 * @returns {object}
 */
async function refreshActivitySeeds(activityId) {
    try {
        const body = types.RefreshActivitySeedsRequest.encode(
            types.RefreshActivitySeedsRequest.create({
                activity_id: Number(activityId) || 0,
            })
        ).finish();
        const { body: replyBody } = await sendMsgAsync(
            'gamepb.activitypb.ActivityService',
            'RefreshActivitySeeds',
            body
        );
        const reply = types.RefreshActivitySeedsReply.decode(replyBody);
        return {
            success: !!(reply && reply.code === 0),
            code: toNum(reply && reply.code),
            message: String(reply && reply.message || ''),
            reply,
        };
    } catch (err) {
        const errorMsg = String(err.message || '');
        return {
            success: false,
            code: -1,
            message: errorMsg,
            error: errorMsg,
        };
    }
}

/**
 * 购买活动种子
 * @param {number} activityId 活动ID
 * @param {number} seedId 种子ID
 * @param {number} count 购买数量
 * @returns {object}
 */
async function purchaseActivitySeed(activityId, seedId, count = 1) {
    try {
        const body = types.PurchaseActivitySeedRequest.encode(
            types.PurchaseActivitySeedRequest.create({
                activity_id: Number(activityId) || 0,
                seed_id: Number(seedId) || 0,
                count: Number(count) || 1,
            })
        ).finish();
        const { body: replyBody } = await sendMsgAsync(
            'gamepb.activitypb.ActivityService',
            'PurchaseActivitySeed',
            body
        );
        const reply = types.PurchaseActivitySeedReply.decode(replyBody);
        return {
            success: !!(reply && reply.code === 0),
            code: toNum(reply && reply.code),
            message: String(reply && reply.message || ''),
            reply,
        };
    } catch (err) {
        const errorMsg = String(err.message || '');
        return {
            success: false,
            code: -1,
            message: errorMsg,
            error: errorMsg,
        };
    }
}

/**
 * 更新刷新统计信息
 */
function updateRefreshStats(activityId, limit) {
    const key = String(activityId);
    if (!REFRESH_STATE.refreshStats.has(key)) {
        REFRESH_STATE.refreshStats.set(key, {
            used: 0,
            total: limit.total,
            dateKey: getDateKey(),
        });
    }
    const stat = REFRESH_STATE.refreshStats.get(key);
    // 如果日期变更，重置统计
    if (stat.dateKey !== getDateKey()) {
        stat.dateKey = getDateKey();
        stat.used = 0;
        stat.total = limit.total;
    }
    return stat;
}

/**
 * 智能判断是否应该刷新
 * @param {object} limit 刷新限制信息
 * @param {object} stat 统计信息
 * @param {number} lastRefreshTimestamp 上次刷新时间戳
 * @returns {{shouldRefresh: boolean, reason: string}}
 */
function shouldRefreshSeeds(limit, stat, lastRefreshTimestamp) {
    if (limit.remaining <= 0) {
        return {
            shouldRefresh: false,
            reason: `刷新次数已用完 (已用: ${stat.used}/${stat.total})`,
        };
    }

    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTimestamp;

    // 如果还有刷新次数且距离上次刷新足够长，应该刷新
    if (timeSinceLastRefresh >= REFRESH_COOLDOWN_MS) {
        return {
            shouldRefresh: true,
            reason: `可以刷新 (剩余次数: ${limit.remaining}/${limit.total})`,
        };
    }

    return {
        shouldRefresh: false,
        reason: `刷新冷却中 (距离下次刷新: ${Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLastRefresh) / 1000)}秒)`,
    };
}

/**
 * 自动刷新活动种子
 */
async function autoRefreshActivitySeeds(activity, force = false) {
    if (!activity) {
        return {
            success: false,
            error: '活动数据为空',
        };
    }

    const activityId = toNum(activity.activity_id || 0);
    if (activityId <= 0) {
        return {
            success: false,
            error: '活动ID无效',
        };
    }

    const limit = parseRefreshLimit(activity);
    const stat = updateRefreshStats(activityId, limit);
    const now = Date.now();
    const lastRefreshTs = lastRefreshAt || 0;

    const { shouldRefresh, reason } = shouldRefreshSeeds(limit, stat, lastRefreshTs);

    if (!force && !shouldRefresh) {
        return {
            success: false,
            reason,
            stat,
        };
    }

    log(ACTIVITY_LOG_MODULE, `准备刷新活动种子: ${reason}`, {
        event: 'refresh_prepare',
        activityId,
        reason,
    });

    try {
        const result = await refreshActivitySeeds(activityId);
        
        if (result.success) {
            stat.used += 1;
            lastRefreshAt = now;
            lastRefreshResult = result;

            const newSeeds = parseActivitySeeds(activity);
            log(ACTIVITY_LOG_MODULE, `刷新活动种子成功，获得 ${newSeeds.length} 种种子`, {
                event: 'refresh_success',
                activityId,
                seedCount: newSeeds.length,
                stats: {
                    used: stat.used,
                    total: stat.total,
                },
            });

            return {
                success: true,
                seeds: newSeeds,
                stat,
            };
        } else {
            const errorMsg = result.message || '未知错误';
            logWarn(ACTIVITY_LOG_MODULE, `刷新活动种子失败: [${result.code}] ${errorMsg}`, {
                event: 'refresh_failed',
                activityId,
                code: result.code,
                message: errorMsg,
            });

            return {
                success: false,
                error: errorMsg,
                code: result.code,
                stat,
            };
        }
    } catch (err) {
        logWarn(ACTIVITY_LOG_MODULE, `刷新活动种子异常: ${err.message}`, {
            event: 'refresh_exception',
            activityId,
            error: err.message,
        });
        return {
            success: false,
            error: err.message,
            stat,
        };
    }
}

/**
 * 自动购买所有活动种子
 */
async function autoPurchaseAllActivitySeeds(activity) {
    if (!activity) {
        return {
            success: false,
            error: '活动数据为空',
            purchased: [],
        };
    }

    const activityId = toNum(activity.activity_id || 0);
    if (activityId <= 0) {
        return {
            success: false,
            error: '活动ID无效',
            purchased: [],
        };
    }

    const seeds = parseActivitySeeds(activity);
    if (seeds.length === 0) {
        log(ACTIVITY_LOG_MODULE, '活动中无可用种子', {
            event: 'purchase_no_seeds',
            activityId,
        });
        return {
            success: true,
            purchased: [],
            message: '活动中无可用种子',
        };
    }

    const purchased = [];
    let purchaseCount = 0;
    let failCount = 0;

    for (const seed of seeds) {
        try {
            // 查询可购买数量
            const buyCount = Math.max(1, seed.available);
            
            log(ACTIVITY_LOG_MODULE, `开始购买种子: ${seed.seedName} (ID: ${seed.seedId})，数量: ${buyCount}`, {
                event: 'purchase_start',
                activityId,
                seedId: seed.seedId,
                seedName: seed.seedName,
                count: buyCount,
            });

            const result = await purchaseActivitySeed(activityId, seed.seedId, buyCount);

            if (result.success) {
                purchaseCount += 1;
                purchased.push({
                    seedId: seed.seedId,
                    seedName: seed.seedName,
                    count: buyCount,
                    success: true,
                });

                log(ACTIVITY_LOG_MODULE, `购买种子成功: ${seed.seedName} x${buyCount}`, {
                    event: 'purchase_success',
                    activityId,
                    seedId: seed.seedId,
                    count: buyCount,
                });

                // 累计统计
                const key = seed.seedId;
                REFRESH_STATE.purchasedSeeds.set(key, (REFRESH_STATE.purchasedSeeds.get(key) || 0) + buyCount);

                // 购买间隔
                await sleep(500 + Math.random() * 500);
            } else {
                failCount += 1;
                const errorMsg = result.message || `未知错误 (code: ${result.code})`;
                purchased.push({
                    seedId: seed.seedId,
                    seedName: seed.seedName,
                    count: buyCount,
                    success: false,
                    error: errorMsg,
                });

                logWarn(ACTIVITY_LOG_MODULE, `购买种子失败: ${seed.seedName} - ${errorMsg}`, {
                    event: 'purchase_failed',
                    activityId,
                    seedId: seed.seedId,
                    code: result.code,
                    message: errorMsg,
                });
            }
        } catch (err) {
            failCount += 1;
            purchased.push({
                seedId: seed.seedId,
                seedName: seed.seedName,
                success: false,
                error: err.message,
            });

            logWarn(ACTIVITY_LOG_MODULE, `购买种子异常: ${seed.seedName} - ${err.message}`, {
                event: 'purchase_exception',
                activityId,
                seedId: seed.seedId,
                error: err.message,
            });
        }
    }

    const summary = `成功购买 ${purchaseCount} 种，失败 ${failCount} 种`;
    log(ACTIVITY_LOG_MODULE, `活动种子购买完成: ${summary}`, {
        event: 'purchase_complete',
        activityId,
        successCount: purchaseCount,
        failCount,
        total: seeds.length,
    });

    return {
        success: failCount === 0,
        purchased,
        summary,
        stats: {
            success: purchaseCount,
            failed: failCount,
            total: seeds.length,
        },
    };
}

/**
 * 获取统计数据
 */
function getActivityStats() {
    return {
        lastCheckAt: lastActivityCheckAt,
        lastRefreshAt,
        lastActivityData: lastActivityData ? {
            activityId: toNum(lastActivityData.activity_id),
            activityName: String(lastActivityData.activity_name || ''),
        } : null,
        refreshStats: Object.fromEntries(REFRESH_STATE.refreshStats),
        purchasedSeeds: Object.fromEntries(REFRESH_STATE.purchasedSeeds),
    };
}

/**
 * 主自动化循环
 */
async function startActivityLoop(options = {}) {
    if (activityLoopRunning) return;
    
    activityLoopRunning = true;
    const {
        autoRefresh = true,
        autoPurchase = true,
        checkInterval = ACTIVITY_CHECK_INTERVAL_MS,
    } = options;

    log(ACTIVITY_LOG_MODULE, '启动活动自动化循环', {
        event: 'loop_start',
        autoRefresh,
        autoPurchase,
        checkInterval,
    });

    // 创建调度器
    if (!activityScheduler) {
        activityScheduler = createScheduler('activity');
    }

    // 主循环
    async function activityLoop() {
        while (activityLoopRunning) {
            try {
                const now = Date.now();
                if (now - lastActivityCheckAt < checkInterval) {
                    await sleep(10 * 1000); // 10秒后再检查
                    continue;
                }

                lastActivityCheckAt = now;

                // 获取最新活动信息
                const activityInfo = await getActivityInfo();
                if (!activityInfo) {
                    await sleep(checkInterval / 2);
                    continue;
                }

                lastActivityData = activityInfo;

                // 自动刷新
                if (autoRefresh) {
                    const refreshResult = await autoRefreshActivitySeeds(activityInfo);
                    if (!refreshResult.success) {
                        log(ACTIVITY_LOG_MODULE, `刷新结果: ${refreshResult.reason || refreshResult.error}`, {
                            event: 'refresh_result',
                            success: false,
                        });
                    }

                    // 刷新后延迟再购买
                    if (refreshResult.success) {
                        await sleep(2000);
                    }
                }

                // 自动购买
                if (autoPurchase) {
                    const purchaseResult = await autoPurchaseAllActivitySeeds(activityInfo);
                    log(ACTIVITY_LOG_MODULE, `购买结果: ${purchaseResult.summary}`, {
                        event: 'purchase_result',
                        success: purchaseResult.success,
                        stats: purchaseResult.stats,
                    });
                }

                await sleep(checkInterval);
            } catch (err) {
                logWarn(ACTIVITY_LOG_MODULE, `活动循环异常: ${err.message}`, {
                    event: 'loop_error',
                    error: err.message,
                });
                await sleep(30 * 1000); // 发生错误后等待30秒
            }
        }
    }

    // 后台运行循环
    setImmediate(activityLoop);
}

/**
 * 停止活动循环
 */
function stopActivityLoop() {
    activityLoopRunning = false;
    log(ACTIVITY_LOG_MODULE, '停止活动自动化循环', {
        event: 'loop_stop',
    });
}

module.exports = {
    startActivityLoop,
    stopActivityLoop,
    getActivityInfo,
    refreshActivitySeeds,
    purchaseActivitySeed,
    autoRefreshActivitySeeds,
    autoPurchaseAllActivitySeeds,
    getActivityStats,
};
