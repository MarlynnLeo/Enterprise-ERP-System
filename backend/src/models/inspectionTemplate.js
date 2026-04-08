/**
 * inspectionTemplate.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class InspectionTemplate extends Model {
    static associate(models) {
      // 定义关联关系
      InspectionTemplate.belongsToMany(models.InspectionItem, {
        through: models.TemplateItemMapping,
        foreignKey: 'template_id',
        otherKey: 'item_id',
        as: 'InspectionItems',
      });
    }
  }

  InspectionTemplate.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      template_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '模板编号',
      },
      template_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '模板名称',
      },
      inspection_type: {
        type: DataTypes.ENUM('incoming', 'process', 'final'),
        allowNull: false,
        comment: '检验类型：来料检验、过程检验、成品检验',
      },
      material_type: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '物料类型ID',
      },
      is_general: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否通用模板',
      },
      version: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '版本号',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '模板描述',
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'draft'),
        allowNull: false,
        defaultValue: 'draft',
        comment: '状态：活跃、非活跃、草稿',
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '创建人',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间',
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '更新时间',
      },
    },
    {
      sequelize,
      modelName: 'InspectionTemplate',
      tableName: 'inspection_templates',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return InspectionTemplate;
};
