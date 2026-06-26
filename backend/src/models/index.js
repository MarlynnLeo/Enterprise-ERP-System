/**
 * index.js
 * @description Sequelize 模型注册入口
 * @date 2025-08-27
 * @version 1.0.0
 *
 * ⚠️ A-2 ORM 统一计划:
 * 项目主体使用 mysql2 原生 SQL（390+ 文件），仅以下模块使用 Sequelize：
 *   - User (user.js)
 *   - Todo + TodoParticipant (todo.js, todoParticipant.js)
 *   - InspectionTemplate + InspectionItem + TemplateItemMapping
 *
 * 迁移策略（逐模块替换，非一次性重写）：
 *   1. 新模块一律使用 mysql2 原生 SQL + Service 层
 *   2. 现有 Sequelize 模块在做功能修改时顺便迁移
 *   3. 优先迁移 User 模块（被其他模块广泛依赖）
 *   4. 迁移完成后移除 sequelize 和 config/sequelize.js
 */

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const sequelize = require('../config/sequelize');
const db = {};

// 特别处理User模型和Todo模型，确保它们被优先加载
const userModel = require('./user')(sequelize);
db[userModel.name] = userModel;

const todoModel = require('./todo')(sequelize);
db[todoModel.name] = todoModel;

// 然后加载其他Sequelize模型
fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      // 排除已经手动加载的模型和其他非Sequelize模型
      !['qualityInspection.js', 'qualityStandard.js', 'user.js', 'todo.js', 'index.js'].includes(
        file
      )
    );
  })
  .forEach((file) => {
    const modelPath = path.join(__dirname, file);
    const modelModule = require(modelPath);

    if (typeof modelModule === 'function') {
      try {
        const model = modelModule(sequelize);
        db[model.name] = model;
      } catch {
        // 非标准 Sequelize 模型（如 Class 形式）静默跳过
      }
    }
  });

// 然后加载其他类型的模型
const otherModels = [
  'qualityInspection.js',
  'qualityStandard.js',
];

otherModels.forEach((file) => {
  if (fs.existsSync(path.join(__dirname, file))) {
    const modelPath = path.join(__dirname, file);
    const modelModule = require(modelPath);
    const modelName = file.replace('.js', '');
    db[modelName] = modelModule;
  }
});

// 单独处理特殊模型

// 设置模型关联
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
