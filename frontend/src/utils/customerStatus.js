/** Customer records use numeric status; accept legacy labels at the UI boundary. */
export const normalizeCustomerStatus = (status = 1) =>
  status === 1 || status === '1' || status === true || status === 'active' ? 1 : 0
