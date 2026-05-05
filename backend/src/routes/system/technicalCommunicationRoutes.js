/**
 * 技术通讯路由
 */

const express = require('express');
const router = express.Router();
const technicalCommunicationController = require('../../controllers/system/technicalCommunicationController');
const { authenticateToken } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/requirePermission');

// 所有路由都需要认证
router.use(authenticateToken);

// 获取技术通讯列表
router.get('/', requirePermission('system:tech-comm'), technicalCommunicationController.getCommunications);

// 获取技术通讯详情
router.get('/:id', requirePermission('system:tech-comm'), technicalCommunicationController.getCommunicationDetail);

// 创建技术通讯
router.post('/', requirePermission('system:tech-comm:create'), technicalCommunicationController.createCommunication);

// 更新技术通讯
router.put('/:id', requirePermission('system:tech-comm:edit'), technicalCommunicationController.updateCommunication);

// 删除技术通讯
router.delete('/:id', requirePermission('system:tech-comm:delete'), technicalCommunicationController.deleteCommunication);

// 添加评论
router.post('/:id/comments', requirePermission('system:tech-comm'), technicalCommunicationController.addComment);

// 删除评论
router.delete('/comments/:commentId', requirePermission('system:tech-comm'), technicalCommunicationController.deleteComment);

// 点赞
router.post('/:id/like', requirePermission('system:tech-comm'), technicalCommunicationController.toggleLike);

// 收藏
router.post('/:id/favorite', requirePermission('system:tech-comm'), technicalCommunicationController.toggleFavorite);

// 获取用户互动状态
router.get('/:id/interaction', requirePermission('system:tech-comm'), technicalCommunicationController.getUserInteraction);

// 获取抄送人员列表
router.get('/:id/recipients', requirePermission('system:tech-comm'), technicalCommunicationController.getRecipients);

// 标记为已读
router.post('/:id/mark-read', requirePermission('system:tech-comm'), technicalCommunicationController.markAsRead);

module.exports = router;
