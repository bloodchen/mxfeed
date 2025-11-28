import { DB } from './db.js';
import logger from './logger.js';

// 模拟全局对象
const gl = {
  logger: logger
};

async function dbExample() {
  try {
    console.log('=== 数据库连接示例 ===');
    
    // 创建DB实例
    const db = await DB.create(gl);
    
    console.log('\n=== 基本查询示例 ===');
    
    // 查询当前时间和版本
    const timeResult = await db.findOne('SELECT NOW() as current_time, version() as db_version');
    console.log('数据库时间:', timeResult.current_time);
    console.log('数据库版本:', timeResult.db_version.split(' ')[0]);
    
    console.log('\n=== 表操作示例 ===');
    
    // 检查表是否存在
    const tableExists = await db.tableExists('users');
    console.log('users表是否存在:', tableExists);
    
    // 创建示例表（如果不存在）
    if (!tableExists) {
      console.log('创建users表...');
      await db.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('users表创建成功');
    }
    
    console.log('\n=== 数据操作示例 ===');
    
    // 插入数据
    const newUser = await db.insert('users', {
      name: '张三',
      email: 'zhangsan@example.com'
    });
    console.log('插入用户:', newUser);
    
    // 查询数据
    const users = await db.findMany('SELECT * FROM users ORDER BY id DESC LIMIT 5');
    console.log('最近5个用户:', users);
    
    // 更新数据
    if (newUser) {
      const updatedUser = await db.update('users', 
        { name: '张三（已更新）' }, 
        { id: newUser.id }
      );
      console.log('更新用户:', updatedUser);
    }
    
    console.log('\n=== 事务示例 ===');
    
    // 事务操作
    const transactionResult = await db.transaction(async (client) => {
      // 在事务中插入多个用户
      const user1 = await client.query(
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
        ['李四', 'lisi@example.com']
      );
      
      const user2 = await client.query(
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
        ['王五', 'wangwu@example.com']
      );
      
      return {
        user1: user1.rows[0],
        user2: user2.rows[0]
      };
    });
    
    console.log('事务插入结果:', transactionResult);
    
    console.log('\n=== 连接池状态 ===');
    const poolStatus = db.getPoolStatus();
    console.log('连接池状态:', poolStatus);
    
    console.log('\n=== 清理示例数据 ===');
    
    // 删除示例数据
    const deletedCount = await db.delete('users', { name: '张三（已更新）' });
    console.log('删除记录数:', deletedCount);
    
    // 关闭连接
    await db.close();
    console.log('\n数据库连接已关闭');
    
  } catch (error) {
    console.error('示例执行失败:', error.message);
    process.exit(1);
  }
}

// 环境变量说明
console.log('=== 环境变量配置说明 ===');
console.log('\n方式1：使用连接字符串（推荐）');
console.log('DATABASE_URL: postgresql://username:password@host:port/database');
console.log('DB_CONNECTION_STRING: postgresql://username:password@host:port/database');
console.log('\n方式2：使用分离的配置参数');
console.log('DB_HOST: 数据库主机地址 (默认: localhost)');
console.log('DB_PORT: 数据库端口 (默认: 5432)');
console.log('DB_NAME: 数据库名称 (默认: postgres)');
console.log('DB_USER: 数据库用户名 (默认: postgres)');
console.log('DB_PASSWORD: 数据库密码 (默认: 空)');
console.log('\n连接池配置:');
console.log('DB_POOL_MAX: 连接池最大连接数 (默认: 20)');
console.log('DB_IDLE_TIMEOUT: 空闲连接超时时间 (默认: 30000ms)');
console.log('DB_CONNECTION_TIMEOUT: 连接超时时间 (默认: 2000ms)');
console.log('\n示例连接字符串:');
console.log('postgresql://postgres:password@localhost:5432/mydb');
console.log('postgresql://user:pass@db.example.com:5432/production_db?sslmode=require');
console.log('');

// 运行示例
if (process.argv[2] === 'run') {
  dbExample();
} else {
  console.log('使用 "node db-example.js run" 来运行示例');
  console.log('注意: 请确保PostgreSQL服务正在运行并且连接配置正确');
}