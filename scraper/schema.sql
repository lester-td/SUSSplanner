-- =========================================
-- SIMPLIFIED TIMETABLE PLANNING APP SCHEMA
-- Supabase / PostgreSQL
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
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_semester UNIQUE (academic_year, semester_no)
);

CREATE TABLE IF NOT EXISTS semester_weeks (
    week_id           BIGSERIAL PRIMARY KEY,
    semester_id       BIGINT NOT NULL REFERENCES semesters(semester_id) ON DELETE CASCADE,
    week_no           SMALLINT NOT NULL CHECK (week_no > 0),
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

CREATE TABLE IF NOT EXISTS classes (
    class_id          BIGSERIAL PRIMARY KEY,
    course_code       VARCHAR(20) NOT NULL REFERENCES courses(course_code) ON DELETE RESTRICT,
    semester_id       BIGINT NOT NULL REFERENCES semesters(semester_id) ON DELETE RESTRICT,
    schedule_type     VARCHAR(20) NOT NULL CHECK (schedule_type IN ('daytime', 'evening')),
    group_code_type   VARCHAR(10) NOT NULL CHECK (group_code_type IN ('TG', 'CRN')),
    group_code        VARCHAR(20) NOT NULL,
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
    venue             VARCHAR(255),
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

CREATE INDEX IF NOT EXISTS idx_classes_course ON classes(course_code);
CREATE INDEX IF NOT EXISTS idx_classes_semester ON classes(semester_id);
CREATE INDEX IF NOT EXISTS idx_classes_lookup ON classes(semester_id, schedule_type, course_code, group_code);
CREATE INDEX IF NOT EXISTS idx_class_events_class ON class_events(class_id);
CREATE INDEX IF NOT EXISTS idx_class_events_date ON class_events(event_date);
CREATE INDEX IF NOT EXISTS idx_class_events_class_date ON class_events(class_id, event_date, start_time);
CREATE INDEX IF NOT EXISTS idx_semester_weeks_semester_dates ON semester_weeks(semester_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_assessment_components_course ON assessment_components(course_code);
CREATE INDEX IF NOT EXISTS idx_assessment_components_course_schedule ON assessment_components(course_code, schedule_type);

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
    ce.venue,
    ce.remarks,
    sw.week_id,
    sw.week_no,
    sw.week_type,
    sw.label AS week_label
FROM class_events ce
JOIN classes c ON c.class_id = ce.class_id
LEFT JOIN semester_weeks sw
    ON sw.semester_id = c.semester_id
   AND ce.event_date BETWEEN sw.start_date AND sw.end_date;

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
