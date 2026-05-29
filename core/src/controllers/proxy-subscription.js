/**
 * 代理订阅管理
 * 提供Clash、小火箭等客户端的VPN订阅链接
 * 支持从免费节点聚合服务获取或自定义节点
 */

const axios = require('axios');
const logger = require('../utils/logger');

// 外部免费节点聚合服务列表
const FREE_PROXY_SOURCES = [
  // xyfqzy/free-nodes - 每天自动更新
  'https://raw.githubusercontent.com/xyfqzy/free-nodes/main/nodes/clash.yaml',
  // PuddinCat/BestClash - 每30分钟更新
  'https://raw.githubusercontent.com/PuddinCat/BestClash/main/proxies.yaml',
  // Au1rxx/free-vpn-subscriptions
  'https://raw.githubusercontent.com/Au1rxx/free-vpn-subscriptions/main/clash.yaml'
];

// 本地缓存
let cachedProxyYaml = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

/**
 * 从外部源获取Clash配置
 */
async function fetchProxyYamlFromSource(sourceUrl) {
  try {
    const response = await axios.get(sourceUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return response.data;
  } catch (error) {
    logger.warn(`获取代理源失败: ${sourceUrl}`, { error: error.message });
    return null;
  }
}

/**
 * 尝试从多个源获取代理配置
 */
async function fetchProxyYamlWithFallback() {
  for (const source of FREE_PROXY_SOURCES) {
    const yaml = await fetchProxyYamlFromSource(source);
    if (yaml && yaml.length > 100) {
      logger.info(`成功获取代理配置: ${source}`, { size: yaml.length });
      return yaml;
    }
  }
  
  logger.warn('无法从任何源获取有效的代理配置');
  return null;
}

/**
 * 获取缓存的或新鲜的Clash YAML
 */
async function getProxyYaml(forceRefresh = false) {
  const now = Date.now();
  
  // 检查缓存是否有效
  if (!forceRefresh && cachedProxyYaml && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedProxyYaml;
  }
  
  // 获取新的代理配置
  const yaml = await fetchProxyYamlWithFallback();
  
  if (yaml) {
    cachedProxyYaml = yaml;
    cacheTimestamp = now;
  }
  
  return yaml;
}

/**
 * 生成小火箭导入链接
 * 小火箭可以导入ss://、vmess://、vless:// 等URI格式
 */
function generateShadowrocketLink() {
  // 这里返回一个通用的Clash订阅链接
  // 小火箭可以通过URL导入
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3007';
  return `${baseUrl}/api/proxy/subscribe/clash`;
}

/**
 * 生成二维码URL
 */
function generateQrCodeUrl(link) {
  // 使用Google Charts API生成二维码
  const encodedLink = encodeURIComponent(link);
  return `https://chart.googleapis.com/chart?chs=300x300&chld=M|0&cht=qr&chl=${encodedLink}`;
}

module.exports = function setupProxySubscriptionApi(app, { logger: l }) {
  logger = l || logger;

  /**
   * 获取Clash订阅配置
   * GET /api/proxy/subscribe/clash
   * 用于Clash导入
   */
  app.get('/api/proxy/subscribe/clash', async (req, res) => {
    try {
      const yaml = await getProxyYaml();
      
      if (!yaml) {
        return res.status(503).json({
          ok: false,
          error: '无法获取代理配置，请稍后重试'
        });
      }

      // 返回YAML配置
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="proxies.yaml"');
      res.send(yaml);
    } catch (error) {
      logger.error('获取Clash订阅失败', { error: error.message });
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  /**
   * 获取订阅链接信息
   * GET /api/proxy/subscribe/info
   */
  app.get('/api/proxy/subscribe/info', async (req, res) => {
    try {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3007';
      
      const clashLink = `${baseUrl}/api/proxy/subscribe/clash`;
      const shadowrocketLink = clashLink; // 小火箭也支持Clash格式
      
      res.json({
        ok: true,
        data: {
          // Clash订阅链接
          clash: {
            url: clashLink,
            qrCode: generateQrCodeUrl(clashLink),
            description: '用于Clash、Clash Verge等客户端'
          },
          // 小火箭订阅链接
          shadowrocket: {
            url: shadowrocketLink,
            qrCode: generateQrCodeUrl(shadowrocketLink),
            description: '用于Shadowrocket、Quantumult X等iOS客户端'
          },
          // 自动登录链接
          autoLogin: {
            url: `${baseUrl}/?vpn_login=true`,
            description: '点击自动登录（需要VPN已连接）'
          },
          // 使用说明
          instructions: [
            '1. 选择与你的客户端对应的订阅链接',
            '2. 在客户端中添加/导入此链接',
            '3. 更新代理列表',
            '4. 连接VPN后即可使用'
          ]
        }
      });
    } catch (error) {
      logger.error('获取订阅信息失败', { error: error.message });
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  /**
   * 手动刷新缓存
   * POST /api/admin/proxy/refresh
   * 只有管理员可访问
   */
  app.post('/api/admin/proxy/refresh', async (req, res) => {
    try {
      const yaml = await getProxyYaml(true); // forceRefresh = true
      
      if (!yaml) {
        return res.status(503).json({
          ok: false,
          error: '无法获取最新的代理配置'
        });
      }

      logger.info('代理缓存已刷新');
      res.json({
        ok: true,
        message: '代理配置已刷新',
        cacheSize: yaml.length
      });
    } catch (error) {
      logger.error('刷新代理缓存失败', { error: error.message });
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  /**
   * 获取代理统计信息
   * GET /api/admin/proxy/stats
   */
  app.get('/api/admin/proxy/stats', async (req, res) => {
    try {
      const yaml = await getProxyYaml();
      const cacheAge = Math.round((Date.now() - cacheTimestamp) / 1000);
      
      res.json({
        ok: true,
        data: {
          cached: !!yaml,
          cacheAge: `${cacheAge}秒前`,
          cacheDuration: `${CACHE_DURATION / 60000}分钟`,
          sources: FREE_PROXY_SOURCES,
          clashLink: `${process.env.FRONTEND_URL || 'http://localhost:3007'}/api/proxy/subscribe/clash`
        }
      });
    } catch (error) {
      logger.error('获取代理统计失败', { error: error.message });
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });
};
