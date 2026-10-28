/**
 * 课程范围归一化：年级、册次、学科。
 * 未传年级时仍默认三年级上册，避免旧调用串到其他年级。
 */

const BOOKS = [
  { grade: '三年级', semester: '上册' },
  { grade: '三年级', semester: '下册' },
  { grade: '四年级', semester: '上册' },
  { grade: '四年级', semester: '下册' },
  { grade: '五年级', semester: '上册' },
  { grade: '五年级', semester: '下册' },
  { grade: '六年级', semester: '上册' },
  { grade: '六年级', semester: '下册' },
]

const SUPPORTED = {
  grade: '三年级',
  semester: '上册',
  subjects: ['数学', '科学', '语文', '英语', '道德与法治'],
  books: BOOKS,
  grade_aliases: {
    三年级: '三年级',
    小学三年级: '三年级',
    '3年级': '三年级',
    三年级上: '三年级',
    三年级上册: '三年级',
    grade3: '三年级',
    '3': '三年级',
    四年级: '四年级',
    小学四年级: '四年级',
    '4年级': '四年级',
    四年级上: '四年级',
    四年级上册: '四年级',
    四年级下: '四年级',
    四年级下册: '四年级',
    grade4: '四年级',
    '4': '四年级',
    五年级: '五年级',
    小学五年级: '五年级',
    '5年级': '五年级',
    五年级上: '五年级',
    五年级上册: '五年级',
    五年级下: '五年级',
    五年级下册: '五年级',
    grade5: '五年级',
    '5': '五年级',
    六年级: '六年级',
    小学六年级: '六年级',
    '6年级': '六年级',
    六年级上: '六年级',
    六年级上册: '六年级',
    六年级下: '六年级',
    六年级下册: '六年级',
    grade6: '六年级',
    '6': '六年级',
  },
  semester_aliases: {
    上册: '上册',
    上学期: '上册',
    第一学期: '上册',
    上: '上册',
    semester1: '上册',
    '1': '上册',
    下册: '下册',
    下学期: '下册',
    第二学期: '下册',
    下: '下册',
    semester2: '下册',
    '2': '下册',
  },
  subject_aliases: {
    数学: '数学',
    算数: '数学',
    math: '数学',
    科学: '科学',
    自然: '科学',
    science: '科学',
    语文: '语文',
    语文课: '语文',
    chinese: '语文',
    英语: '英语',
    英文: '英语',
    english: '英语',
    PEP: '英语',
    道德与法治: '道德与法治',
    道法: '道德与法治',
    品德: '道德与法治',
    moral: '道德与法治',
  },
}

function normalizeKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
}

function lookup(map, raw) {
  if (raw == null || raw === '') return null
  const t = String(raw).trim()
  if (map[t]) return map[t]
  const k = normalizeKey(t)
  for (const [alias, value] of Object.entries(map)) {
    if (normalizeKey(alias) === k) return value
  }
  return null
}

function normalizeGrade(raw) {
  return lookup(SUPPORTED.grade_aliases, raw)
}

function normalizeSemester(raw) {
  return lookup(SUPPORTED.semester_aliases, raw)
}

function normalizeSubject(raw) {
  return lookup(SUPPORTED.subject_aliases, raw)
}

/**
 * 校验请求范围是否在本图谱覆盖内。
 * 未传 grade/semester 时默认按本图谱范围处理，并写入 warning。
 */
function coverageLabel() {
  return BOOKS.map((b) => `${b.grade}${b.semester}`).join('、')
}

function resolveScope({ main_subject, grade, semester } = {}) {
  const warnings = []
  const subject = main_subject ? normalizeSubject(main_subject) : null

  if (main_subject && !subject) {
    return {
      ok: false,
      status: 'out_of_scope',
      message: `不支持的主学科「${main_subject}」。当前图谱仅覆盖：${SUPPORTED.subjects.join('、')}`,
      scope: null,
      warnings,
    }
  }

  let gradeNorm = grade ? normalizeGrade(grade) : SUPPORTED.grade
  let semesterNorm = semester ? normalizeSemester(semester) : SUPPORTED.semester

  if (grade && !gradeNorm) {
    return {
      ok: false,
      status: 'out_of_scope',
      message: `不支持的年级「${grade}」。当前图谱覆盖：${coverageLabel()}`,
      scope: null,
      warnings,
    }
  }
  if (semester && !semesterNorm) {
    return {
      ok: false,
      status: 'out_of_scope',
      message: `不支持的册次「${semester}」。当前图谱覆盖：${coverageLabel()}`,
      scope: null,
      warnings,
    }
  }

  if (!grade) warnings.push('未指定年级，已按默认范围「三年级」处理')
  if (!semester) warnings.push('未指定册次，已按默认范围「上册」处理')

  const book = BOOKS.find((b) => b.grade === gradeNorm && b.semester === semesterNorm)
  if (!book) {
    return {
      ok: false,
      status: 'out_of_scope',
      message: `请求范围为「${gradeNorm || grade}${semesterNorm || semester}」，当前图谱覆盖「${coverageLabel()}」，不会跨年级匹配`,
      scope: null,
      warnings,
    }
  }

  if (subject && !SUPPORTED.subjects.includes(subject)) {
    return {
      ok: false,
      status: 'out_of_scope',
      message: `主学科「${subject}」不在本图谱覆盖范围内`,
      scope: null,
      warnings,
    }
  }

  return {
    ok: true,
    status: 'success',
    message: '',
    scope: {
      grade: gradeNorm,
      semester: semesterNorm,
      main_subject: subject,
      label: `${gradeNorm}${semesterNorm}${subject ? '·' + subject : ''}`,
    },
    warnings,
  }
}

function bareNodeId(id) {
  const text = String(id || '')
  return text.startsWith('G5') ? text.slice(2) : text
}

function subjectOfNodeId(id) {
  const bare = bareNodeId(id)
  if (!bare) return ''
  if (bare.startsWith('X')) return '跨学科'
  if (bare.startsWith('M')) return '数学'
  if (bare.startsWith('S')) return '科学'
  if (bare.startsWith('C')) return '语文'
  if (bare.startsWith('E')) return '英语'
  if (bare.startsWith('D')) return '道德与法治'
  return ''
}

function subjectKeyOfNodeId(id) {
  const bare = bareNodeId(id)
  if (!bare) return 'other'
  if (bare.startsWith('X')) return 'cross'
  if (bare.startsWith('M')) return 'math'
  if (bare.startsWith('S')) return 'science'
  if (bare.startsWith('C')) return 'chinese'
  if (bare.startsWith('E')) return 'english'
  if (bare.startsWith('D')) return 'moral'
  return 'other'
}

module.exports = {
  BOOKS,
  SUPPORTED,
  normalizeGrade,
  normalizeSemester,
  normalizeSubject,
  resolveScope,
  subjectOfNodeId,
  subjectKeyOfNodeId,
}
