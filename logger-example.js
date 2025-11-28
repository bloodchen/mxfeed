import logger, { Logger } from './logger.js';

// 使用默认logger实例
console.log('=== 使用默认logger实例 ===');
logger.info('应用启动', { port: 3000, env: 'development' });
logger.debug('调试信息', { userId: 123 });
logger.warn('警告信息', { message: '内存使用率较高' });
logger.error('错误信息', { error: 'Database connection failed', code: 'DB_ERROR' });

// 创建自定义logger实例
console.log('\n=== 创建自定义logger实例 ===');
const customLogger = new Logger({
  serviceName: 'my-service',
  logDir: './custom-logs'
});

customLogger.info('自定义logger启动');
customLogger.error('自定义错误', { details: 'Something went wrong' });

// 使用子logger
console.log('\n=== 使用子logger ===');
const requestLogger = logger.child({ requestId: 'req-123', userId: 'user-456' });
requestLogger.info('处理用户请求');
requestLogger.error('请求处理失败', { reason: 'Invalid parameters' });

// 模拟HTTP请求日志
console.log('\n=== HTTP请求日志示例 ===');
const mockReq = {
  method: 'GET',
  url: '/api/users',
  headers: { 'user-agent': 'Mozilla/5.0' },
  ip: '127.0.0.1'
};

const mockRes = {
  statusCode: 200
};

logger.logRequest(mockReq, mockRes, 150);

// 模拟错误请求
const errorRes = {
  statusCode: 500
};

logger.logRequest(mockReq, errorRes, 300);

console.log('\n=== 日志文件说明 ===');
console.log('- 控制台会显示所有级别的日志（开发环境）');
console.log('- 错误日志（warn/error/fatal）会写入到按日期命名的文件中');
console.log('- 文件路径格式: ./logs/{serviceName}-error-{YYYY-MM-DD}.log');
console.log('- 可通过环境变量配置: SERVICE_NAME, LOG_DIR, LOG_LEVEL, NODE_ENV');