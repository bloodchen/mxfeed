import { User } from './user.js';
import { DB } from './db.js';
import logger from './logger.js';

// 模拟全局对象
const gl = {
  logger: logger
};

async function userExample() {
  try {
    console.log('=== 用户管理示例 ===');
    
    // 初始化数据库
    const db = await DB.create(gl);
    gl.db = db;
    
    // 初始化用户服务
    const user = await User.create(gl);
    
    console.log('\n=== 用户注册示例 ===');
    
    // 创建测试用户
    const testUsers = [
      {
        email: 'alice@example.com',
        password: 'password123',
        from: 1,
        info: {
          name: 'Alice',
          age: 25,
          department: 'Engineering'
        }
      },
      {
        email: 'bob@example.com',
        password: 'securepass456',
        from: 2,
        info: {
          name: 'Bob',
          age: 30,
          department: 'Marketing'
        }
      }
    ];
    
    console.log('\n=== 第三方用户创建示例（自动生成密码）===');
    
    // 第三方用户（无密码，系统自动生成）
    const thirdPartyUsers = [
      {
        email: 'charlie@magiclink.com',
        from: 1, // Magic Link
        info: {
          name: 'Charlie',
          provider: 'Magic Link',
          externalId: 'ml_12345'
        }
      },
      {
        email: 'diana@gmail.com',
        from: 2, // Google
        info: {
          name: 'Diana',
          provider: 'Google',
          externalId: 'google_67890'
        }
      },
      {
        email: 'eve@maxthon.com',
        from: 3, // Maxthon
        info: {
          name: 'Eve',
          provider: 'Maxthon',
          externalId: 'mx_abcdef'
        }
      }
    ];
    
    for (const userData of thirdPartyUsers) {
      try {
        const newUser = await user.createUser(userData);
        console.log('第三方用户创建成功（自动生成密码）:', {
          uid: newUser.uid,
          email: newUser.email,
          from: newUser.from,
          provider: user.getFromName(newUser.from)
        });
        testUsers.push(newUser); // 添加到测试用户列表中
      } catch (error) {
        console.log('第三方用户创建失败:', error.message);
      }
    }
    
    console.log('\n=== 普通用户创建示例 ===');
    
    const createdUsers = [];
    
    for (const userData of testUsers) {
      try {
        const newUser = await user.createUser(userData);
        console.log('用户创建成功:', {
          uid: newUser.uid,
          email: newUser.email,
          from: newUser.from
        });
        createdUsers.push(newUser);
      } catch (error) {
        console.log('用户创建失败:', error.message);
      }
    }
    
    console.log('\n=== 用户登录验证示例 ===');
    
    // 测试登录
    const loginTests = [
      { email: 'alice@example.com', password: 'password123' }, // 正确
      { email: 'alice@example.com', password: 'wrongpass' },   // 错误密码
      { email: 'nonexist@example.com', password: 'password' }  // 不存在的用户
    ];
    
    for (const loginData of loginTests) {
      try {
        const authenticatedUser = await user.authenticateUser(loginData.email, loginData.password);
        if (authenticatedUser) {
          console.log('登录成功:', {
            uid: authenticatedUser.uid,
            email: authenticatedUser.email
          });
        } else {
          console.log('登录失败:', loginData.email);
        }
      } catch (error) {
        console.log('登录错误:', error.message);
      }
    }
    
    console.log('\n=== 用户查询示例 ===');
    
    if (createdUsers.length > 0) {
      const firstUser = createdUsers[0];
      
      // 根据ID查询
      const userById = await user.getUserById(firstUser.uid);
      console.log('根据ID查询用户:', userById);
      
      // 根据邮箱查询
      const userByEmail = await user.getUserByEmail(firstUser.email);
      console.log('根据邮箱查询用户:', userByEmail);
    }

    console.log('\n=== ensureUser 函数示例 ===');
    
    // ensureUser 示例 - 确保用户存在，不存在则创建
    const ensureUserTests = [
      {
        email: 'frank@example.com',
        from: 2, // Google
        info: {
          name: 'Frank',
          provider: 'Google',
          externalId: 'google_frank123'
        }
      },
      {
        email: 'alice@example.com', // 已存在的用户
        from: 1,
        info: {
          name: 'Alice Existing',
          note: '这是已存在的用户测试'
        }
      },
      {
        uid: createdUsers.length > 0 ? createdUsers[0].uid : null, // 通过UID查找
        from: 0
      }
    ];
    
    for (const testData of ensureUserTests) {
      try {
        const ensuredUser = await user.ensureUser(testData);
        console.log('ensureUser 成功:', {
          uid: ensuredUser.uid,
          email: ensuredUser.email,
          from: ensuredUser.from,
          action: testData.email === 'alice@example.com' ? '返回已存在用户' : 
                  testData.uid ? '通过UID查找用户' : '创建新用户'
        });
      } catch (error) {
        console.log('ensureUser 失败:', error.message, testData);
      }
    }
    
    console.log('\n=== ensureUser 第三方登录场景示例 ===');
    
    // 模拟第三方登录场景
    const thirdPartyLoginScenarios = [
      {
        scenario: 'Google登录 - 新用户',
        userData: {
          email: 'google.newuser@gmail.com',
          from: 2,
          info: {
            name: 'Google New User',
            provider: 'Google',
            googleId: 'google_new_12345',
            avatar: 'https://example.com/avatar.jpg'
          }
        }
      },
      {
        scenario: 'Maxthon登录 - 已存在用户',
        userData: {
          email: 'eve@maxthon.com', // 之前创建的用户
          from: 3,
          info: {
            name: 'Eve Updated',
            provider: 'Maxthon',
            maxthonId: 'mx_updated_abcdef'
          }
        }
      }
    ];
    
    for (const scenario of thirdPartyLoginScenarios) {
      try {
        console.log(`\n场景: ${scenario.scenario}`);
        const result = await user.ensureUser(scenario.userData);
        console.log('结果:', {
          uid: result.uid,
          email: result.email,
          from: result.from,
          provider: user.getFromName(result.from),
          isNewUser: !result.created_at || new Date() - new Date(result.created_at) < 1000
        });
      } catch (error) {
        console.log(`场景 ${scenario.scenario} 失败:`, error.message);
      }
    }

    console.log('\n=== 用户信息更新示例 ===');
    
    if (createdUsers.length > 0) {
      const firstUser = createdUsers[0];
      
      // 更新用户信息
      const updatedUser = await user.updateUser(firstUser.uid, {
        info: {
          name: 'Alice Updated',
          age: 26,
          department: 'Senior Engineering',
          lastLogin: new Date().toISOString()
        },
        status: 1
      });
      
      console.log('用户信息更新成功:', updatedUser);
    }
    
    console.log('\n=== 密码更新示例 ===');
    
    if (createdUsers.length > 0) {
      const firstUser = createdUsers[0];
      
      try {
        await user.updatePassword(firstUser.uid, 'password123', 'newpassword456');
        console.log('密码更新成功');
        
        // 验证新密码
        const loginWithNewPassword = await user.authenticateUser(firstUser.email, 'newpassword456');
        if (loginWithNewPassword) {
          console.log('新密码验证成功');
        }
      } catch (error) {
        console.log('密码更新失败:', error.message);
      }
    }
    
    console.log('\n=== 用户列表查询示例 ===');
    
    // 获取用户列表
    const userList = await user.getUserList({
      page: 1,
      limit: 10,
      status: 1
    });
    
    console.log('用户列表:', {
      总用户数: userList.pagination.total,
      当前页: userList.pagination.page,
      用户: userList.users.map(u => ({
        uid: u.uid,
        email: u.email,
        from: u.from,
        status: u.status
      }))
    });
    
    // 搜索用户
    const searchResult = await user.getUserList({
      search: 'alice',
      status: 1
    });
    
    console.log('搜索结果:', searchResult.users.length, '个用户');
    
    console.log('\n=== 用户删除示例 ===');
    
    if (createdUsers.length > 1) {
      const secondUser = createdUsers[1];
      
      // 软删除用户
      await user.deleteUser(secondUser.uid);
      console.log('用户删除成功:', secondUser.email);
      
      // 验证删除后的状态
      const deletedUser = await user.getUserById(secondUser.uid);
      console.log('删除后用户状态:', deletedUser ? deletedUser.status : '用户不存在');
    }
    
    console.log('\n=== 数据库表结构信息 ===');
    console.log('表名: users');
    console.log('字段:');
    console.log('- uid: SERIAL PRIMARY KEY (用户ID)');
    console.log('- email: TEXT UNIQUE NOT NULL (邮箱)');
    console.log('- pass: TEXT NOT NULL (加密密码)');
    console.log('- from: INTEGER DEFAULT 0 (来源)');
    console.log('- info: JSONB DEFAULT {} (用户信息)');
    console.log('- created_at: TIMESTAMP (创建时间)');
    console.log('- updated_at: TIMESTAMP (更新时间)');
    console.log('- status: INTEGER DEFAULT 1 (状态: 1=正常, 0=删除)');
    
    console.log('\n=== API端点说明 ===');
    console.log('POST /users/register - 用户注册');
    console.log('POST /users/login - 用户登录');
    console.log('GET /users/:uid - 获取用户信息');
    console.log('POST /users/:uid/update - 更新用户信息');
    console.log('POST /users/:uid/password - 更新密码');
    console.log('DELETE /users/:uid - 删除用户');
    console.log('GET /users - 获取用户列表');
    
    console.log('\n=== API返回格式说明 ===');
    console.log('成功响应: { code: 0, result: {...} }');
    console.log('错误响应: { code: 100, err: "错误信息" }');
    console.log('示例:');
    console.log('  注册成功: { code: 0, result: { uid: 123, email: "user@example.com", ... } }');
    console.log('  登录失败: { code: 100, err: "邮箱或密码错误" }');
    
    // 关闭数据库连接
    await db.close();
    console.log('\n数据库连接已关闭');
    
  } catch (error) {
    console.error('示例执行失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 安全特性说明
console.log('=== 安全特性说明 ===');
console.log('1. 密码加密: 使用 PBKDF2 + SHA512 + 随机盐值');
console.log('2. 第三方用户: 当有from参数但无password时，自动生成16位随机密码');
console.log('3. 随机密码: 包含大小写字母、数字和特殊字符，确保安全性');
console.log('4. SQL注入防护: 所有查询使用参数化查询');
console.log('5. 邮箱唯一性: 数据库层面保证邮箱唯一');
console.log('6. 软删除: 删除用户时只修改状态，保留数据');
console.log('7. 字段验证: 严格验证输入参数');
console.log('8. 详细日志: 记录所有用户操作和错误');
console.log('');
console.log('=== 第三方应用支持 ===');
console.log('1. Magic Link (from=1): 无密码登录链接');
console.log('2. Google (from=2): Google OAuth登录');
console.log('3. Maxthon (from=3): Maxthon浏览器登录');
console.log('4. 自动密码生成: 第三方用户无需提供密码，系统自动生成');
console.log('5. 扩展性: 可轻松添加更多第三方应用支持');
console.log('');

// 运行示例
if (process.argv[2] === 'run') {
  userExample();
} else {
  console.log('使用 "node user-example.js run" 来运行示例');
  console.log('注意: 请确保PostgreSQL服务正在运行并且数据库连接配置正确');
}
    
    console.log('\n=== ensureUser 函数示例 ===');
    
    // ensureUser 示例 - 确保用户存在，不存在则创建
    const ensureUserTests = [
      {
        email: 'frank@example.com',
        from: 2, // Google
        info: {
          name: 'Frank',
          provider: 'Google',
          externalId: 'google_frank123'
        }
      },
      {
        email: 'alice@example.com', // 已存在的用户
        from: 1,
        info: {
          name: 'Alice Existing',
          note: '这是已存在的用户测试'
        }
      },
      {
        uid: createdUsers.length > 0 ? createdUsers[0].uid : null, // 通过UID查找
        from: 0
      }
    ];
    
    for (const testData of ensureUserTests) {
      try {
        const ensuredUser = await user.ensureUser(testData);
        console.log('ensureUser 成功:', {
          uid: ensuredUser.uid,
          email: ensuredUser.email,
          from: ensuredUser.from,
          action: testData.email === 'alice@example.com' ? '返回已存在用户' : 
                  testData.uid ? '通过UID查找用户' : '创建新用户'
        });
      } catch (error) {
        console.log('ensureUser 失败:', error.message, testData);
      }
    }
    
    console.log('\n=== ensureUser 第三方登录场景示例 ===');
    
    // 模拟第三方登录场景
    const thirdPartyLoginScenarios = [
      {
        scenario: 'Google登录 - 新用户',
        userData: {
          email: 'google.newuser@gmail.com',
          from: 2,
          info: {
            name: 'Google New User',
            provider: 'Google',
            googleId: 'google_new_12345',
            avatar: 'https://example.com/avatar.jpg'
          }
        }
      },
      {
        scenario: 'Maxthon登录 - 已存在用户',
        userData: {
          email: 'eve@maxthon.com', // 之前创建的用户
          from: 3,
          info: {
            name: 'Eve Updated',
            provider: 'Maxthon',
            maxthonId: 'mx_updated_abcdef'
          }
        }
      }
    ];
    
    for (const scenario of thirdPartyLoginScenarios) {
      try {
        console.log(`\n场景: ${scenario.scenario}`);
        const result = await user.ensureUser(scenario.userData);
        console.log('结果:', {
          uid: result.uid,
          email: result.email,
          from: result.from,
          provider: user.getFromName(result.from),
          isNewUser: !result.created_at || new Date() - new Date(result.created_at) < 1000
        });
      } catch (error) {
        console.log(`场景 ${scenario.scenario} 失败:`, error.message);
      }
    }