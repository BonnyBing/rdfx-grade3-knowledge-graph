/**
 * 课程范围归一化：年级、册次、学科。
 * 全科图谱建设中：当前已支持「三年级 · 上册 · 数学/科学」，后续按数据扩展。
 */

const SUPPORTED = {
  grade: '三年级',
  semester: '上册',
  subjects: ['数学', '科学'],
  grade_aliases: {
    三年级: '三年级',
    小学三年级: '三年级',
    '3年级': '三年级',
    三年级上: '三年级',
    三年级上册: '三年级',
    grade3: '三年级',
    '3': '三年级',
  },
  semester_aliases: {
    上册: '上册',
    上学期: '上册',
    第一学期: '上册',
    上: '上册',
    semester1: '上册',
    '1': '上册',
  },
  subject_aliases: {
    数学: '数学',
    算数: '数学',
    math: '数学',
    科学: '科学',
    自然: '科学',
    science: '科学',
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
      message: `不支持的年级「${grade}」。当前图谱仅覆盖：${SUPPORTED.grade}${SUPPORTED.semester}`,
      scope: null,
      warnings,
    }
  }
  if (semester && !semesterNorm) {
    return {
      ok: false,
      status: 'out_of_scope',
      message: `不支持的册次「${semester}」。当前图谱仅覆盖：${SUPPORTED.grade}${SUPPORTED.semester}`,
      scope: null,
      warnings,
    }
  }

  if (!grade) warnings.push('未指定年级，已按本图谱默认范围「三年级」处理')
  if (!semester) warnings.push('未指定册次，已按本图谱默认范围「上册」处理')

  if (gradeNorm !== SUPPORTED.grade || semesterNorm !== SUPPORTED.semester) {
    return {
      ok: false,
      status: 'out_of_scope',
      message: `请求范围为「${gradeNorm || grade}${semesterNorm || semester}」，当前图谱仅覆盖「${SUPPORTED.grade}${SUPPORTED.semester}」，不会跨年级匹配`,
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

function subjectOfNodeId(id) {
  if (!id) return ''
  if (String(id).startsWith('X-')) return '跨学科'
  if (String(id).startsWith('M')) return '数学'
  if (String(id).startsWith('S')) return '科学'
  return ''
}

function subjectKeyOfNodeId(id) {
  if (!id) return 'other'
  if (String(id).startsWith('X-')) return 'cross'
  if (String(id).startsWith('M')) return 'math'
  if (String(id).startsWith('S')) return 'science'
  return 'other'
}

module.exports = {
  SUPPORTED,
  normalizeGrade,
  normalizeSemester,
  normalizeSubject,
  resolveScope,
  subjectOfNodeId,
  subjectKeyOfNodeId,
}
