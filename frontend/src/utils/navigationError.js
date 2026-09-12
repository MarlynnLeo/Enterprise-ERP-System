/** Keep failed lazy imports visible even when a navigation caller catches them. */
export const installNavigationErrorHandler = (router, {
  notify,
  report = (error) => console.error('路由错误:', error)
}) => router.onError((error) => {
  report(error)
  notify({
    message: '页面加载失败，请刷新页面后重试',
    grouping: true,
    showClose: true,
    duration: 6000
  })
})
