use rusqlite::Connection;

pub type SchemaResult<T> = Result<T, rusqlite::Error>;

pub struct Migration {
    pub version: i32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "phase_one_foundation",
    sql: r#"
CREATE TABLE IF NOT EXISTS user_profiles (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    full_name       TEXT NOT NULL,
    headline        TEXT NOT NULL DEFAULT '',
    email           TEXT,
    phone           TEXT,
    location        TEXT,
    portfolio_url   TEXT,
    linkedin_url    TEXT,
    github_url      TEXT,
    summary         TEXT,
    skills          TEXT NOT NULL DEFAULT '[]',
    target_roles    TEXT NOT NULL DEFAULT '[]',
    preferences     TEXT NOT NULL DEFAULT '{}',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT NOT NULL,
    domain          TEXT,
    careers_url     TEXT,
    industry        TEXT,
    size            TEXT,
    linkedin_url    TEXT,
    glassdoor_url   TEXT,
    notes           TEXT,
    is_blacklisted  BOOLEAN DEFAULT FALSE,
    is_whitelisted  BOOLEAN DEFAULT FALSE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    source_id        TEXT,
    platform         TEXT NOT NULL,
    url              TEXT NOT NULL,
    title            TEXT NOT NULL,
    company_id       TEXT REFERENCES companies(id),
    company_name     TEXT NOT NULL,
    location         TEXT,
    is_remote        BOOLEAN DEFAULT FALSE,
    salary_min       INTEGER,
    salary_max       INTEGER,
    salary_currency  TEXT DEFAULT 'INR',
    job_type         TEXT,
    experience_level TEXT,
    description      TEXT,
    requirements     TEXT,
    posted_date      DATETIME,
    expires_date     DATETIME,
    raw_html         TEXT,
    match_score      INTEGER,
    match_reasoning  TEXT,
    matched_skills   TEXT,
    missing_skills   TEXT,
    ai_tags          TEXT,
    ai_priority      TEXT,
    discovered_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived      BOOLEAN DEFAULT FALSE,
    UNIQUE(platform, source_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_platform ON jobs(platform);
CREATE INDEX IF NOT EXISTS idx_jobs_match_score ON jobs(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_discovered ON jobs(discovered_at DESC);

CREATE TABLE IF NOT EXISTS applications (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_id             TEXT NOT NULL REFERENCES jobs(id),
    status             TEXT NOT NULL DEFAULT 'queued',
    mode               TEXT DEFAULT 'semi-auto',
    resume_path        TEXT,
    cover_letter_path  TEXT,
    resume_version     INTEGER DEFAULT 1,
    submitted_at       DATETIME,
    submission_url     TEXT,
    confirmation_id    TEXT,
    last_follow_up     DATETIME,
    follow_up_count    INTEGER DEFAULT 0,
    next_follow_up     DATETIME,
    response_date      DATETIME,
    response_type      TEXT,
    response_notes     TEXT,
    error_message      TEXT,
    retry_count        INTEGER DEFAULT 0,
    max_retries        INTEGER DEFAULT 3,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes              TEXT,
    tags               TEXT
);

CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_apps_created ON applications(created_at DESC);

CREATE TABLE IF NOT EXISTS application_events (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    application_id  TEXT NOT NULL REFERENCES applications(id),
    event_type      TEXT NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    description     TEXT,
    metadata        TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    application_id  TEXT REFERENCES applications(id),
    type            TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    version         INTEGER DEFAULT 1,
    ai_model_used   TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id      TEXT REFERENCES companies(id),
    name            TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    linkedin_url    TEXT,
    role            TEXT,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS communications (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    application_id  TEXT REFERENCES applications(id),
    contact_id      TEXT REFERENCES contacts(id),
    direction       TEXT NOT NULL,
    type            TEXT NOT NULL,
    subject         TEXT,
    body            TEXT,
    email_id        TEXT,
    sent_at         DATETIME,
    read_at         DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    cron_expression TEXT,
    is_enabled      BOOLEAN DEFAULT TRUE,
    last_run        DATETIME,
    next_run        DATETIME,
    config          TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    category        TEXT,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_cache (
    prompt_hash     TEXT PRIMARY KEY,
    model           TEXT NOT NULL,
    response        TEXT NOT NULL,
    tokens_used     INTEGER,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME
);
"#,
}];

pub fn initialize_schema(connection: &Connection) -> SchemaResult<()> {
    let current_version = schema_version(connection)?;
    for migration in MIGRATIONS {
        if migration.version > current_version {
            connection.execute_batch(migration.sql)?;
            connection.pragma_update(None, "user_version", migration.version)?;
        }
    }
    Ok(())
}

pub fn schema_version(connection: &Connection) -> SchemaResult<i32> {
    connection.pragma_query_value(None, "user_version", |row| row.get(0))
}

