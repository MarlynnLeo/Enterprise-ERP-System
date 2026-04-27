/**
 * cash/SequelizeModels.js
 * @description 现金管理Sequelize模型定义
 * @date 2026-01-23
 * @version 1.0.0
 */

const sequelize = require('../../config/sequelize');
const { DataTypes } = require('sequelize');

// 银行账户Sequelize模型（原 bankAccount.js 已清理，内联定义于此）
const BankAccount = sequelize.define(
  'BankAccount',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bank_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    account_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    account_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    account_type: {
      type: DataTypes.ENUM('checking', 'savings', 'credit', 'cash'),
      allowNull: false,
      defaultValue: 'checking',
    },
    currency_code: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'CNY',
    },
    opening_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    current_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'bank_accounts',
    timestamps: true,
    underscored: true,
  }
);

// 交易模型
const Transaction = sequelize.define(
  'Transaction',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    transaction_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    transaction_type: {
      type: DataTypes.ENUM('income', 'expense', 'transfer'),
      allowNull: false,
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'bank_accounts',
        key: 'id',
      },
    },
    target_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'bank_accounts',
        key: 'id',
      },
      comment: '只在转账类型交易中使用',
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'categories',
        key: 'id',
      },
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    reference_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    attachment: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: '附件文件路径',
    },
    reconciled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'transactions',
    timestamps: true,
    underscored: true,
  }
);

// 对账模型
const Reconciliation = sequelize.define(
  'Reconciliation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'bank_accounts',
        key: 'id',
      },
    },
    reconciliation_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    bank_statement_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    book_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    difference: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('draft', 'completed'),
      allowNull: false,
      defaultValue: 'draft',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attachment: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: '对账单附件文件路径',
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'reconciliations',
    timestamps: true,
    underscored: true,
  }
);

// 对账条目模型（记录哪些交易已被对账）
const ReconciliationItem = sequelize.define(
  'ReconciliationItem',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    reconciliation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'reconciliations',
        key: 'id',
      },
    },
    transaction_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'transactions',
        key: 'id',
      },
    },
    notes: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'reconciliation_items',
    timestamps: true,
    underscored: true,
  }
);

// 建立关联关系
Transaction.belongsTo(BankAccount, { foreignKey: 'account_id', as: 'account' });
Transaction.belongsTo(BankAccount, { foreignKey: 'target_account_id', as: 'targetAccount' });

Reconciliation.belongsTo(BankAccount, { foreignKey: 'account_id', as: 'account' });
Reconciliation.hasMany(ReconciliationItem, { foreignKey: 'reconciliation_id', as: 'items' });

ReconciliationItem.belongsTo(Reconciliation, { foreignKey: 'reconciliation_id' });
ReconciliationItem.belongsTo(Transaction, { foreignKey: 'transaction_id' });

Transaction.hasMany(ReconciliationItem, { foreignKey: 'transaction_id' });

module.exports = {
  Transaction,
  Reconciliation,
  ReconciliationItem,
};

