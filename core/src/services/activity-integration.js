/**
 * 活动自动化集成模块 - 提供初始化和管理接口
 */

const { startActivityLoop, stopActivityLoop, getActivityStats } = require('./activity');
const { log } = require('../utils/utils');

const ACTIVITY_LOG_MODULE = 'activity-integration';

let isActivityAutomationInitialized = false;

/**
 * 初始化活动自动化
 * @param {object} options 配置选项
 * @param {boolean} [options.enabled=true] 是否启用活动自动化
 * @param {boolean} [options.autoRefresh=true] 是否自动刷新种子
 * @param {boolean} [options.autoPurchase=true] 是否自动购买种子
 * @param {number} [options.checkInterval=300000] 检查间隔（毫秒）
 * @returns {Promise<void>}
 */
async function initActivityAutomation(options = {}) {
    if (isActivityAutomationInitialized) {
        log(ACTIVITY_LOG_MODULE, '活动自动化已初始化，跳过重复初始化', {
            event: 'already_initialized',
        });
        return;
    }

    const {
        enabled = true,
        autoRefresh = true,
        autoPurchase = true,
        checkInterval = 5 * 60 * 1000, // 5分钟
    } = options;

    if (!enabled) {
        log(ACTIVITY_LOG_MODULE, '活动自动化已禁用', {
            event: 'disabled',
        });
        return;
    }

    isActivityAutomationInitialized = true;

    log(ACTIVITY_LOG_MODULE, '初始化活动自动化', {
        event: 'init_start',
        config: {
            autoRefresh,
            autoPurchase,
            checkInterval,
        },
    });

    try {
        startActivityLoop({
            autoRefresh,
            autoPurchase,
            checkInterval,
        });

        log(ACTIVITY_LOG_MODULE, '活动自动化初始化成功', {
            event: 'init_success',
        });
    } catch (err) {
        isActivityAutomationInitialized = false;
        log(ACTIVITY_LOG_MODULE, `活动自动化初始化失败: ${err.message}`, {
            event: 'init_failed',
            error: err.message,
        });
        throw err;
    }
}

/**
 * 清理活动自动化
 */
function cleanupActivityAutomation() {
    if (!isActivityAutomationInitialized) return;

    isActivityAutomationInitialized = false;
    stopActivityLoop();

    log(ACTIVITY_LOG_MODULE, '清理活动自动化', {
        event: 'cleanup',
    });
}

/**
 * 获取活动自动化统计数据
 */
function getActivityAutomationStats() {
    return getActivityStats();
}

/**
 * 检查活动自动化是否已初始化
 */
function isActivityAutomationEnabled() {
    return isActivityAutomationInitialized;
}

module.exports = {
    initActivityAutomation,
    cleanupActivityAutomation,
    getActivityAutomationStats,
    isActivityAutomationEnabled,
};
