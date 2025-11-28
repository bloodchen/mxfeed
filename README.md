# rest_template
template for rest service

## Logger 使用说明

本项目使用基于 [pino](https://github.com/pinojs/pino) 的高性能日志系统，支持错误日志按日期写入文件。

### 功能特性

- 🚀 基于 pino 的高性能日志记录
- 📁 错误日志自动按日期分文件存储
- 🎨 开发环境美化输出（pino-pretty）
- 🔧 支持环境变量配置
- 📊 内置 HTTP 请求日志记录
- 🏷️ 支持子 logger 和上下文绑定

### 快速开始

```javascript
import logger from './logger.js';

// 基本使用
logger.info('应用启动', { port: 3000 });
logger.warn('警告信息', { memory: '85%' });
logger.error('错误信息', { error: 'Database connection failed' });

// HTTP 请求日志
logger.logRequest(req, res, responseTime);

// 子 logger（带上下文）
const requestLogger = logger.child({ requestId: 'req-123' });
requestLogger.info('处理请求');
```

### 环境变量配置

```bash
# 服务名称（影响日志文件名）
SERVICE_NAME=my-service

# 日志目录
LOG_DIR=./logs

# 日志级别
LOG_LEVEL=info

# 运行环境
NODE_ENV=production
```

### 日志文件

- 错误日志文件格式：`{serviceName}-error-{YYYY-MM-DD}.log`
- 只有 `warn`、`error`、`fatal` 级别的日志会写入文件
- 文件内容为 JSON 格式，便于日志分析工具处理

### 运行示例

```bash
node logger-example.js
```

## DB 数据库管理

本项目提供了基于 PostgreSQL 的数据库管理类，继承自 BaseService，提供完整的数据库操作功能。

### 功能特性

- 🗄️ 基于 PostgreSQL 的数据库连接管理
- 🏊 连接池管理，支持高并发访问
- 🔄 完整的事务支持
- 📊 内置查询性能监控和日志记录
- 🛡️ SQL 注入防护（参数化查询）
- 🏥 健康检查和状态监控端点
- 🔧 环境变量配置支持

### 快速开始

```javascript
import { DB } from './db.js';
import logger from './logger.js';

// 创建DB实例
const gl = { logger };
const db = await DB.create(gl);

// 基本查询
const users = await db.findMany('SELECT * FROM users WHERE active = $1', [true]);
const user = await db.findOne('SELECT * FROM users WHERE id = $1', [userId]);

// 数据操作
const newUser = await db.insert('users', {
  name: '张三',
  email: 'zhangsan@example.com'
});

const updatedUser = await db.update('users', 
  { name: '李四' }, 
  { id: userId }
);

const deletedCount = await db.delete('users', { id: userId });

// 事务操作
const result = await db.transaction(async (client) => {
  await client.query('INSERT INTO users ...');
  await client.query('UPDATE accounts ...');
  return { success: true };
});
```

### 环境变量配置

支持两种数据库连接方式：

**方式1：使用连接字符串（推荐）**
```bash
# 使用 DATABASE_URL（标准环境变量）
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# 或者使用 DB_CONNECTION_STRING
DB_CONNECTION_STRING=postgresql://username:password@localhost:5432/database_name

# 连接池配置
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000
```

**方式2：使用分离的配置参数**
```bash
# 当没有连接字符串时，使用分离的参数
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=postgres
DB_PASSWORD=password

# 连接池配置
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000
```

### 健康检查端点

- `GET /health/db` - 数据库健康检查
- `GET /status/db-pool` - 连接池状态查询

### 运行数据库示例

```bash
# 确保PostgreSQL服务运行
node db-example.js run
```

## User 用户管理

本项目提供了完整的用户管理系统，继承自 BaseService，支持用户注册、登录、信息管理等功能，特别支持第三方应用集成。

### 功能特性

- 👤 完整的用户生命周期管理（注册、登录、更新、删除）
- 🔐 安全的密码加密（PBKDF2 + SHA512 + 随机盐值）
- 🌐 第三方应用集成支持（Magic Link、Google、Maxthon等）
- 🔑 第三方用户自动密码生成
- ✅ ensureUser 智能用户管理（存在则返回，不存在则创建）
- 🛡️ SQL注入防护和输入验证
- 📊 用户列表查询（分页、搜索、筛选）
- 🗑️ 软删除机制
- 📝 详细的操作日志记录
- 🚀 RESTful API端点自动注册

### 快速开始

```javascript
import { User } from './user.js';
import { DB } from './db.js';
import logger from './logger.js';

// 初始化
const gl = { logger };
const db = await DB.create(gl);
gl.db = db;
const user = await User.create(gl);

// 普通用户注册
const newUser = await user.createUser({
  email: 'user@example.com',
  password: 'securepassword',
  info: { name: '张三', age: 25 }
});

// 第三方用户注册（自动生成密码）
const thirdPartyUser = await user.createUser({
  email: 'user@gmail.com',
  from: 2, // Google
  info: { 
    name: '李四', 
    provider: 'Google',
    externalId: 'google_12345'
  }
  // 注意：没有password参数，系统会自动生成
});

// 用户登录
const authenticatedUser = await user.authenticateUser('user@example.com', 'securepassword');

// 获取用户信息
const userInfo = await user.getUserById(userId);
const userByEmail = await user.getUserByEmail('user@example.com');

// 更新用户信息
const updatedUser = await user.updateUser(userId, {
  info: { name: '王五', age: 26 },
  status: 1
});

// 确保用户存在（不存在则创建）
const ensuredUser = await user.ensureUser({
  email: 'user@example.com',
  from: 2, // Google
  info: { name: '自动创建用户' }
});
// 如果用户已存在，返回现有用户信息
// 如果用户不存在，自动创建新用户（第三方用户会自动生成密码）

// 用户列表查询
const userList = await user.getUserList({
  page: 1,
  limit: 10,
  status: 1,
  search: '张'
});
```

### 第三方应用支持

系统支持多种第三方应用集成，当创建第三方用户时，如果提供了 `from` 参数但没有 `password`，系统会自动生成16位随机密码：

```javascript
// 支持的第三方应用
const FROM_PROVIDERS = {
  1: 'Magic Link',  // 无密码登录链接
  2: 'Google',      // Google OAuth
  3: 'Maxthon'      // Maxthon浏览器
};

// 第三方用户创建示例
const magicLinkUser = await user.createUser({
  email: 'user@magiclink.com',
  from: 1, // Magic Link
  info: {
    name: 'Magic User',
    externalId: 'ml_abc123'
  }
  // 系统自动生成密码：包含大小写字母、数字和特殊字符
});
```

### ensureUser 智能用户管理

`ensureUser` 函数是一个智能的用户管理工具，它会检查用户是否存在：
- 如果用户已存在，直接返回用户信息
- 如果用户不存在，自动创建新用户

**使用场景：**
- 第三方登录集成（OAuth、SSO等）
- 自动用户注册
- 用户数据同步

**支持的查找方式：**
```javascript
// 通过邮箱查找/创建
const user1 = await user.ensureUser({
  email: 'user@example.com',
  from: 2, // Google
  info: { name: '新用户' }
});

// 通过UID查找
const user2 = await user.ensureUser({
  uid: 12345,
  from: 0
});

// 第三方用户（自动生成密码）
const user3 = await user.ensureUser({
  email: 'oauth@provider.com',
  from: 3, // Maxthon
  info: {
    name: 'OAuth User',
    externalId: 'provider_12345'
  }
  // 注意：第三方用户无需密码，系统自动生成
});
```

**函数特点：**
- 智能判断：自动检测用户是否存在
- 灵活查找：支持通过邮箱或UID查找
- 自动创建：不存在时自动创建新用户
- 第三方支持：自动处理第三方用户密码生成
- 安全可靠：所有操作都有完整的日志记录

### 数据库表结构

```sql
CREATE TABLE users (
  uid SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pass TEXT NOT NULL,
  "from" INTEGER DEFAULT 0,
  info JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status INTEGER DEFAULT 1
);
```

### API端点

系统自动注册以下RESTful API端点：

- `POST /users/register` - 用户注册
- `POST /users/login` - 用户登录
- `GET /users/:uid` - 获取用户信息
- `POST /users/:uid/update` - 更新用户信息
- `POST /users/:uid/password` - 更新密码
- `DELETE /users/:uid` - 删除用户（软删除）
- `GET /users` - 获取用户列表

### API返回格式

所有API端点使用统一的返回格式：

**成功响应：**
```json
{
  "code": 0,
  "result": {
    // 具体的返回数据
  }
}
```

**错误响应：**
```json
{
  "code": 100,
  "err": "错误信息描述"
}
```

**示例：**
```javascript
// 用户注册成功
{
  "code": 0,
  "result": {
    "uid": 123,
    "email": "user@example.com",
    "from": 0,
    "info": { "name": "张三" },
    "created_at": "2024-01-01T00:00:00.000Z",
    "status": 1
  }
}

// 登录失败
{
  "code": 100,
  "err": "邮箱或密码错误"
}

// 获取用户列表成功
{
  "code": 0,
  "result": {
    "users": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "totalPages": 5
    }
  }
}
```

### 安全特性

- **密码加密**：使用 PBKDF2 + SHA512 + 随机盐值
- **自动密码生成**：第三方用户16位随机密码（包含大小写字母、数字、特殊字符）
- **SQL注入防护**：所有查询使用参数化查询
- **输入验证**：严格的参数验证和错误处理
- **软删除**：删除用户时只修改状态，保留数据
- **详细日志**：记录所有用户操作和安全事件

### 运行用户管理示例

```bash
# 确保PostgreSQL服务运行和数据库连接配置正确
node user-example.js run
```
