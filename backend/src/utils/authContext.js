function getAuthenticatedUserId(req) {
  const rawUserId = req?.user?.id ?? req?.user?.userId;
  const userId = Number.parseInt(rawUserId, 10);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('当前登录用户无效，无法完成需要用户身份的操作');
  }

  return userId;
}

module.exports = {
  getAuthenticatedUserId,
};
