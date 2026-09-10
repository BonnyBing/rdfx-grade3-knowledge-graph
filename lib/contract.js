/**
 * 智启插件统一返回契约。
 * HTTP 层多数情况仍返回 200，业务成败看 code / status / image_status。
 */

const crypto = require('node:crypto')

const QUERY_STATUS = [
  'success',
  'partial',
  'ambiguous',
  'not_found',
  'out_of_scope',
  'no_relation',
  'invalid_input',
  'error',
]

const IMAGE_STATUS = ['success', 'error', 'not_requested']

function requestId() {
  return `req_${crypto.randomBytes(8).toString('hex')}`
}

function emptyBase(overrides = {}) {
  return {
    code: 0,
    status: 'success',
    message: '',
    request_id: requestId(),
    graph_version: '',
    warnings: [],
    ...overrides,
  }
}

/** 业务码：0 表示接口处理完成且可解析；非 0 表示入参/系统错误 */
function statusCode(status) {
  if (status === 'invalid_input') return 400
  if (status === 'error') return 500
  return 0
}

function withStatus(base, status, message = '') {
  return {
    ...base,
    code: statusCode(status),
    status,
    message: message || (status === 'success' ? '' : message),
  }
}

module.exports = {
  QUERY_STATUS,
  IMAGE_STATUS,
  requestId,
  emptyBase,
  statusCode,
  withStatus,
}
