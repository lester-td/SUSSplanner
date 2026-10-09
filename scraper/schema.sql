-- =========================================
-- SUSSplanner
-- Supabase / PostgreSQL
-- =========================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================================
-- TABLES
-- =========================================

CREATE TABLE IF NOT EXISTS courses (
    course_code             VARCHAR(20) PRIMARY KEY,
    course_name             VARCHAR(255),
    school_name             VARCHAR(255),
    is_postgraduate         BOOLEAN,
    course_level            VARCHAR(50),
    credit_units            NUMERIC(4,1),
    presentation_pattern    TEXT,
    course_synopsis         TEXT,
    course_topics           JSONB,
    learning_outcomes       JSONB,
    synopsis_url            TEXT,
    last_scraped_at         TIMESTAMPTZ,
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS semesters (
    semester_id       BIGSERIAL PRIMARY KEY,
    academic_year     VARCHAR(9) NOT NULL,
    semester_no       SMALLINT NOT NULL CHECK (semester_no IN (1, 2, 3)),
    semester_name     VARCHAR(100) NOT NULL,
    is_archived       BOOLEAN NOT NULL DEFAULT false,
    has_intake_schedule BOOLEAN NOT NULL DEFAULT false,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_semester UNIQUE (academic_year, semester_no)
);

CREATE TABLE IF NOT EXISTS semester_weeks (
    week_id           BIGSERIAL PRIMARY KEY,
    semester_id       BIGINT NOT NULL REFERENCES semesters(semester_id) ON DELETE CASCADE,
    week_no           SMALLINT NOT NULL CHECK (week_no >= 0),
    week_type         VARCHAR(20) NOT NULL CHECK (week_type IN ('TEACHING', 'STUDY', 'EXAM')),
    label             VARCHAR(50) NOT NULL,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_semester_week_no UNIQUE (semester_id, week_no),
    CONSTRAINT uq_semester_week_label UNIQUE (semester_id, label),
    CONSTRAINT uq_semester_week_range UNIQUE (semester_id, start_date, end_date),
    CONSTRAINT chk_week_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS academic_calendar_events (
    event_id          BIGSERIAL PRIMARY KEY,
    calendar_year     SMALLINT NOT NULL CHECK (calendar_year >= 2000),
    audience          VARCHAR(20) NOT NULL CHECK (audience IN ('FTUG', 'PTUG', 'LAW', 'GRAD')),
    event_title       VARCHAR(255) NOT NULL,
    event_category    VARCHAR(50) NOT NULL,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
    source_url        TEXT,
    remarks           TEXT,
    sort_order        INT NOT NULL DEFAULT 1,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_academic_calendar_event_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS academic_calendar_event_semesters (
    event_id          BIGINT NOT NULL REFERENCES academic_calendar_events(event_id) ON DELETE CASCADE,
    semester_id       BIGINT NOT NULL REFERENCES semesters(semester_id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, semester_id)
);

CREATE TABLE IF NOT EXISTS announcements (
    announcement_id   BIGSERIAL PRIMARY KEY,
    message           TEXT NOT NULL,
    link_url          TEXT,
    link_label        VARCHAR(100),
    publish_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ,
    enabled           BOOLEAN NOT NULL DEFAULT false,
    sort_order        INT NOT NULL DEFAULT 1,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_announcement_message CHECK (btrim(message) <> ''),
    CONSTRAINT chk_announcement_dates CHECK (expires_at IS NULL OR expires_at > publish_at),
    CONSTRAINT chk_announcement_link CHECK (
        (link_url IS NULL AND link_label IS NULL)
        OR (link_url IS NOT NULL AND link_label IS NOT NULL
            AND btrim(link_url) <> '' AND btrim(link_label) <> '')
    )
);

-- Announcements are read through build-time snapshots, not the browser Data API.
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.announcements FROM PUBLIC;

-- Supabase client roles may not exist on a standalone PostgreSQL installation.
DO $$
DECLARE
    client_role TEXT;
    id_sequence TEXT := pg_get_serial_sequence('public.announcements', 'announcement_id');
BEGIN
    IF id_sequence IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', id_sequence);
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.announcements FROM %I', client_role);
            IF id_sequence IS NOT NULL THEN
                EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I', id_sequence, client_role);
            END IF;
        END IF;
    END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS classes (
    class_id          BIGSERIAL PRIMARY KEY,
    course_code       VARCHAR(20) NOT NULL REFERENCES courses(course_code) ON DELETE RESTRICT,
    semester_id       BIGINT NOT NULL REFERENCES semesters(semester_id) ON DELETE RESTRICT,
    schedule_type     VARCHAR(20) NOT NULL CHECK (schedule_type IN ('daytime', 'evening')),
    group_code_type   VARCHAR(10) NOT NULL CHECK (group_code_type IN ('TG', 'CRN')),
    group_code        VARCHAR(20) NOT NULL,
    language          VARCHAR(50),
    available_as_gsp  BOOLEAN,
    is_restricted     BOOLEAN,
    remarks           TEXT,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_class UNIQUE (
        course_code,
        semester_id,
        schedule_type,
        group_code_type,
        group_code
    )
);

CREATE TABLE IF NOT EXISTS class_events (
    event_id          BIGSERIAL PRIMARY KEY,
    class_id          BIGINT NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
    event_kind        VARCHAR(20) NOT NULL CHECK (event_kind IN ('CLASS', 'EXAM', 'OTHER')),
    event_date        DATE NOT NULL,
    day_of_week       SMALLINT GENERATED ALWAYS AS (EXTRACT(ISODOW FROM event_date)::SMALLINT) STORED,
    start_time        TIME NOT NULL,
    end_time          TIME NOT NULL,
    event_mode        VARCHAR(100),
    campus            VARCHAR(255),
    remarks           TEXT,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_class_event_time CHECK (end_time > start_time),
    CONSTRAINT uq_class_event UNIQUE (
        class_id,
        event_kind,
        event_date,
        start_time,
        end_time
    )
);

CREATE TABLE IF NOT EXISTS assessment_components (
    component_id       BIGSERIAL PRIMARY KEY,
    course_code        VARCHAR(20) NOT NULL REFERENCES courses(course_code) ON DELETE CASCADE,
    schedule_type      VARCHAR(20) NOT NULL CHECK (schedule_type IN ('daytime', 'evening')),
    component_name     VARCHAR(100) NOT NULL,
    component_group    VARCHAR(10) NOT NULL CHECK (component_group IN ('OCAS', 'OES')),
    assessment_mode    VARCHAR(100),
    weight_percentage  NUMERIC(5,2) NOT NULL CHECK (weight_percentage > 0 AND weight_percentage <= 100),
    sort_order         INT NOT NULL DEFAULT 1,
    last_updated       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_assessment_component UNIQUE (
        course_code,
        schedule_type,
        sort_order
    )
);

-- =========================================
-- BTREE INDEXES
-- Joins, filters, timetable loading
-- =========================================

CREATE INDEX IF NOT EXISTS idx_courses_school_name
ON courses (school_name);

CREATE INDEX IF NOT EXISTS idx_announcements_publication
ON announcements (publish_at, sort_order) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_courses_course_level
ON courses (course_level);

CREATE INDEX IF NOT EXISTS idx_courses_is_postgraduate
ON courses (is_postgraduate);

CREATE INDEX IF NOT EXISTS idx_classes_course
ON classes (course_code);

CREATE INDEX IF NOT EXISTS idx_classes_semester
ON classes (semester_id);

CREATE INDEX IF NOT EXISTS idx_classes_schedule_type
ON classes (schedule_type);

CREATE INDEX IF NOT EXISTS idx_classes_available_as_gsp
ON classes (available_as_gsp);

CREATE INDEX IF NOT EXISTS idx_classes_course_semester
ON classes (course_code, semester_id);

CREATE INDEX IF NOT EXISTS idx_classes_lookup
ON classes (semester_id, schedule_type, course_code, group_code);

CREATE INDEX IF NOT EXISTS idx_classes_course_semester_schedule_group
ON classes (course_code, semester_id, schedule_type, group_code_type, group_code);

CREATE INDEX IF NOT EXISTS idx_class_events_class
ON class_events (class_id);

CREATE INDEX IF NOT EXISTS idx_class_events_date
ON class_events (event_date);

CREATE INDEX IF NOT EXISTS idx_class_events_kind
ON class_events (event_kind);

CREATE INDEX IF NOT EXISTS idx_class_events_class_date
ON class_events (class_id, event_date, start_time);

CREATE INDEX IF NOT EXISTS idx_class_events_class_date_time
ON class_events (class_id, event_date, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_semester_weeks_semester
ON semester_weeks (semester_id);

CREATE INDEX IF NOT EXISTS idx_semester_weeks_semester_dates
ON semester_weeks (semester_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_academic_calendar_events_audience
ON academic_calendar_events (audience);

CREATE INDEX IF NOT EXISTS idx_academic_calendar_events_calendar_year
ON academic_calendar_events (calendar_year);

CREATE INDEX IF NOT EXISTS idx_academic_calendar_events_dates
ON academic_calendar_events (start_date, end_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_calendar_event
ON academic_calendar_events (
    calendar_year,
    audience,
    event_title,
    start_date,
    end_date
);

CREATE INDEX IF NOT EXISTS idx_academic_calendar_event_semesters_semester
ON academic_calendar_event_semesters (semester_id);

CREATE INDEX IF NOT EXISTS idx_academic_calendar_event_semesters_event
ON academic_calendar_event_semesters (event_id);

CREATE INDEX IF NOT EXISTS idx_assessment_components_course
ON assessment_components (course_code);

CREATE INDEX IF NOT EXISTS idx_assessment_components_schedule_type
ON assessment_components (schedule_type);

CREATE INDEX IF NOT EXISTS idx_assessment_components_course_schedule
ON assessment_components (course_code, schedule_type);

-- =========================================
-- TRIGRAM INDEXES FOR LIVE SEARCH
-- Supports ILIKE '%term%' efficiently
-- =========================================

CREATE INDEX IF NOT EXISTS idx_courses_course_code_trgm
ON courses USING gin (course_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_courses_course_name_trgm
ON courses USING gin (course_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_courses_school_name_trgm
ON courses USING gin (school_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_courses_synopsis_trgm
ON courses USING gin (course_synopsis gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_courses_upper_course_code_trgm
ON courses USING gin (upper(course_code) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_assessment_component_name_trgm
ON assessment_components USING gin (component_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_assessment_assessment_mode_trgm
ON assessment_components USING gin (assessment_mode gin_trgm_ops);

-- =========================================
-- VIEW
-- =========================================

CREATE OR REPLACE VIEW v_class_events_with_week
WITH (security_invoker = true) AS
SELECT
    ce.event_id,
    ce.class_id,
    c.course_code,
    c.semester_id,
    c.schedule_type,
    c.group_code_type,
    c.group_code,
    ce.event_kind,
    ce.event_date,
    ce.day_of_week,
    ce.start_time,
    ce.end_time,
    ce.event_mode,
    ce.campus,
    ce.remarks,
    sw.week_id,
    sw.week_no,
    sw.week_type,
    sw.label AS week_label
FROM class_events ce
JOIN classes c
    ON c.class_id = ce.class_id
LEFT JOIN semester_weeks sw
    ON sw.semester_id = c.semester_id
   AND ce.event_date BETWEEN sw.start_date AND sw.end_date;

-- =========================================
-- TRIGGER FUNCTION
-- =========================================

CREATE OR REPLACE FUNCTION set_last_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_courses_last_updated ON courses;
CREATE TRIGGER trg_courses_last_updated
BEFORE UPDATE ON courses
FOR EACH ROW
EXECUTE FUNCTION set_last_updated();

DROP TRIGGER IF EXISTS trg_semesters_last_updated ON semesters;
CREATE TRIGGER trg_semesters_last_updated
BEFORE UPDATE ON semesters
FOR EACH ROW
EXECUTE FUNCTION set_last_updated();

DROP TRIGGER IF EXISTS trg_semester_weeks_last_updated ON semester_weeks;
CREATE TRIGGER trg_semester_weeks_last_updated
BEFORE UPDATE ON semester_weeks
FOR EACH ROW
EXECUTE FUNCTION set_last_updated();

DROP TRIGGER IF EXISTS trg_academic_calendar_events_last_updated ON academic_calendar_events;
CREATE TRIGGER trg_academic_calendar_events_last_updated
BEFORE UPDATE ON academic_calendar_events
FOR EACH ROW
EXECUTE FUNCTION set_last_updated();

DROP TRIGGER IF EXISTS trg_announcements_last_updated ON announcements;
CREATE TRIGGER trg_announcements_last_updated
BEFORE UPDATE ON announcements
FOR EACH ROW
EXECUTE FUNCTION set_last_updated();

DROP TRIGGER IF EXISTS trg_classes_last_updated ON classes;
CREATE TRIGGER trg_classes_last_updated
BEFORE UPDATE ON classes
FOR EACH ROW
EXECUTE FUNCTION set_last_updated();

DROP TRIGGER IF EXISTS trg_class_events_last_updated ON class_events;
CREATE TRIGGER trg_class_events_last_updated
BEFORE UPDATE ON class_events
FOR EACH ROW
EXECUTE FUNCTION set_last_updated();

DROP TRIGGER IF EXISTS trg_assessment_components_last_updated ON assessment_components;
CREATE TRIGGER trg_assessment_components_last_updated
BEFORE UPDATE ON assessment_components
FOR EACH ROW
EXECUTE FUNCTION set_last_updated();

ANALYZE courses;
ANALYZE semesters;
ANALYZE semester_weeks;
ANALYZE academic_calendar_events;
ANALYZE academic_calendar_event_semesters;
ANALYZE announcements;
ANALYZE classes;
ANALYZE class_events;
ANALYZE assessment_components;

-- Reviewed prerequisite display schema. Additive; does not import academic data.
-- Curriculum decisions/timestamps are written explicitly by the reviewed importer.
-- No additional SQL function or update trigger is required for these two tables;
-- set_last_updated() above continues to serve the existing academic tables.
-- An experimental layout must be reconciled separately, never silently reused.
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'curriculum_plans')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'curriculum_plans' AND column_name = 'publication_input_hash') THEN
    RAISE EXCEPTION 'Experimental curriculum_plans exists. Inspect and prepare an explicit retained-data reconciliation before applying the maintained schema.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'curriculum_prerequisite_rules')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'curriculum_prerequisite_rules' AND column_name = 'approved_rule_hash') THEN
    RAISE EXCEPTION 'Experimental curriculum_prerequisite_rules exists. Inspect and reconcile it before applying the reviewed schema.';
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS curriculum_plans (
  plan_key TEXT PRIMARY KEY CHECK (plan_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  programme_name TEXT NOT NULL CHECK (btrim(programme_name) <> ''),
  study_mode TEXT CHECK (study_mode IS NULL OR study_mode IN ('full-time', 'part-time')),
  curriculum_version TEXT, effective_from TEXT,
  source_path TEXT NOT NULL CHECK (btrim(source_path) <> ''),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  source_label TEXT NOT NULL CHECK (btrim(source_label) <> ''), source_url TEXT,
  publication_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (publication_status IN ('unreviewed', 'included', 'excluded')),
  publication_input_hash TEXT NOT NULL CHECK (publication_input_hash ~ '^publication-input:v1:[a-f0-9]{64}$'),
  reviewed_publication_input_hash TEXT, publication_reviewed_by TEXT,
  publication_reviewed_at TIMESTAMPTZ, publication_review_notes TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_curriculum_publication_decision CHECK (
    (publication_status = 'unreviewed' AND reviewed_publication_input_hash IS NULL AND publication_reviewed_by IS NULL AND publication_reviewed_at IS NULL AND publication_review_notes IS NULL)
    OR (publication_status IN ('included', 'excluded') AND reviewed_publication_input_hash IS NOT NULL AND reviewed_publication_input_hash = publication_input_hash AND publication_reviewed_by IS NOT NULL AND btrim(publication_reviewed_by) <> '' AND publication_reviewed_at IS NOT NULL)
  )
);
CREATE TABLE IF NOT EXISTS curriculum_prerequisite_rules (
  rule_key TEXT PRIMARY KEY,
  plan_key TEXT NOT NULL REFERENCES curriculum_plans(plan_key) ON DELETE RESTRICT,
  course_code VARCHAR(20) NOT NULL CHECK (course_code ~ '^[A-Z0-9]{3,20}$'),
  applicability_key TEXT NOT NULL CHECK (applicability_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  applicability_label TEXT NOT NULL CHECK (btrim(applicability_label) <> ''),
  raw_text TEXT NOT NULL CHECK (btrim(raw_text) <> ''),
  parse_status TEXT NOT NULL CHECK (parse_status IN ('parsed', 'review_required', 'unparsed')),
  rule_json JSONB, parser_contract_version INT NOT NULL CHECK (parser_contract_version > 0),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  source_occurrences JSONB NOT NULL CHECK (jsonb_typeof(source_occurrences) = 'array' AND jsonb_array_length(source_occurrences) > 0),
  record_status TEXT NOT NULL DEFAULT 'active' CHECK (record_status IN ('active', 'inactive')),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'source_only', 'excluded')),
  review_input_hash TEXT NOT NULL CHECK (review_input_hash ~ '^review-input:v1:[a-f0-9]{64}$'),
  reviewed_input_hash TEXT, approved_rule_json JSONB, approved_rule_hash TEXT,
  reviewed_by TEXT, reviewed_at TIMESTAMPTZ, review_notes TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_curriculum_prerequisite_scope UNIQUE (plan_key, course_code, applicability_key),
  CONSTRAINT chk_curriculum_rule_identity CHECK (rule_key = 'prerequisite:' || plan_key || ':' || course_code || ':' || applicability_key),
  CONSTRAINT chk_curriculum_rule_decision CHECK (
    (review_status = 'pending' AND reviewed_input_hash IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_notes IS NULL AND approved_rule_json IS NULL AND approved_rule_hash IS NULL)
    OR (review_status IN ('approved', 'source_only', 'excluded') AND reviewed_input_hash IS NOT NULL AND reviewed_input_hash = review_input_hash AND reviewed_by IS NOT NULL AND btrim(reviewed_by) <> '' AND reviewed_at IS NOT NULL AND
      ((review_status = 'approved' AND approved_rule_json IS NOT NULL AND jsonb_typeof(approved_rule_json) = 'object' AND approved_rule_hash IS NOT NULL AND approved_rule_hash ~ '^approved-rule:v1:[a-f0-9]{64}$')
       OR (review_status IN ('source_only', 'excluded') AND approved_rule_json IS NULL AND approved_rule_hash IS NULL)))
  )
);
-- Additive upgrade for installations created before diagnostic evidence was bound.
-- Existing decisions are retained; reconciliation invalidates changed fingerprints.
ALTER TABLE curriculum_prerequisite_rules ADD COLUMN IF NOT EXISTS evidence_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_diagnostics) = 'array');
CREATE INDEX IF NOT EXISTS idx_curriculum_rules_course ON curriculum_prerequisite_rules(course_code);
CREATE INDEX IF NOT EXISTS idx_curriculum_rules_plan ON curriculum_prerequisite_rules(plan_key);
ALTER TABLE curriculum_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_prerequisite_rules ENABLE ROW LEVEL SECURITY;
