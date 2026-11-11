// Skema Turso (SQLite). Setiap tabel menggantikan satu tab spreadsheet di versi Apps Script.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,              -- employee id
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    job TEXT NOT NULL DEFAULT '',
    outlet TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',    -- '' | ADMIN | SUPER_ADMIN (mentor & trainee berasal dari data)
    active INTEGER NOT NULL DEFAULT 1,
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS curricula (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS stages (
    id TEXT PRIMARY KEY,
    curriculum_id TEXT NOT NULL REFERENCES curricula(id),
    name TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    stage_id TEXT NOT NULL REFERENCES stages(id),
    parent_id TEXT,
    name TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 1,
    rule TEXT NOT NULL DEFAULT 'SELF_CONFIRMED', -- SELF_CONFIRMED | ACKNOWLEDGED | MENTOR_PASSED | PRE_SUBMITTED_AND_POST_PASSED | ALL_REQUIRED_CHILDREN
    required_for_stage INTEGER NOT NULL DEFAULT 1,
    required_for_parent INTEGER NOT NULL DEFAULT 1,
    pre_required INTEGER NOT NULL DEFAULT 0,
    post_required INTEGER NOT NULL DEFAULT 0,
    passing_score INTEGER NOT NULL DEFAULT 70,
    prerequisite_id TEXT,
    due_days INTEGER,
    mentor_ids TEXT NOT NULL DEFAULT '[]', -- JSON: mentor/trainer yang boleh mendampingi praktik ini
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,               -- format: MODULE | VIDEO | SOP | PRE_TEST | POST_TEST
    category TEXT NOT NULL DEFAULT 'DOCUMENT', -- jenis: DOCUMENT | IT_TOOL
    positions TEXT NOT NULL DEFAULT '[]',      -- JSON id jabatan yang boleh melihat di Documents ([] = semua)
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    activity_id TEXT,                 -- lama (v1); sekarang lewat resource_links
    stage_id TEXT,
    curriculum_id TEXT,
    parent_id TEXT,                   -- pre/post-test menempel ke modul/SOP
    seq INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL REFERENCES resources(id),
    seq INTEGER NOT NULL DEFAULT 1,
    question TEXT NOT NULL,
    options TEXT NOT NULL,            -- JSON array of strings
    answer INTEGER NOT NULL           -- index jawaban benar
  )`,
  `CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    curriculum_id TEXT NOT NULL REFERENCES curricula(id),
    status TEXT NOT NULL DEFAULT 'Active',
    start_date TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    UNIQUE (user_id, curriculum_id)
  )`,
  `CREATE TABLE IF NOT EXISTS mentor_assignments (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
    mentor_id TEXT NOT NULL REFERENCES users(id),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
    activity_id TEXT NOT NULL REFERENCES activities(id),
    status TEXT NOT NULL DEFAULT 'Locked', -- Locked | Assigned | Completed (dulu: formula Current Status)
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    due_at TEXT,
    evidence_at TEXT,
    theory_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
    practical_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    pre_score INTEGER,
    pre_at TEXT,
    post_score INTEGER,
    post_at TEXT,
    post_passed INTEGER NOT NULL DEFAULT 0,
    post_attempts INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    practice_mentor_id TEXT,          -- pendamping praktik pilihan trainee
    UNIQUE (enrollment_id, activity_id)
  )`,
  `CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES assignments(id),
    resource_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    score INTEGER NOT NULL,
    passed INTEGER NOT NULL DEFAULT 0,
    answers TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL UNIQUE REFERENCES enrollments(id),
    issued_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS outlets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    location TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS mentors (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    curricula TEXT NOT NULL DEFAULT '[]', -- JSON id kurikulum yang boleh dibimbing
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS resource_links (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL REFERENCES resources(id),
    activity_id TEXT,
    stage_id TEXT,
    curriculum_id TEXT,
    seq INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_link_act ON resource_links(activity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_link_res ON resource_links(resource_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assign_enr ON assignments(enrollment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempt_assign ON quiz_attempts(assignment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mentor_enr ON mentor_assignments(enrollment_id)`,
];

// Kolom yang ditambahkan setelah versi pertama: [tabel, kolom, definisi]. Ditambahkan otomatis bila belum ada.
export const ADDED_COLUMNS = [
  ['activities', 'mentor_ids', "TEXT NOT NULL DEFAULT '[]'"],
  ['resources', 'category', "TEXT NOT NULL DEFAULT 'DOCUMENT'"],
  ['resources', 'positions', "TEXT NOT NULL DEFAULT '[]'"],
  ['assignments', 'practice_mentor_id', 'TEXT'],
];
