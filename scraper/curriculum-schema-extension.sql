-- Experimental curriculum-plan schema.
--
-- This is not a migration and is not part of the application's currently deployed
-- schema. Apply this file directly to an empty disposable database. Do not apply
-- scraper/schema.sql there: its reviewed prerequisite tables have incompatible
-- layouts. All references in this experimental model are internal to these tables.

BEGIN;

DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'curriculum_plans' AND column_name = 'publication_input_hash') THEN
    RAISE EXCEPTION 'Experimental curriculum schema cannot be applied over reviewed prerequisite tables.';
  END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS curriculum_plans (
    plan_key                TEXT PRIMARY KEY,
    programme_name          TEXT NOT NULL,
    programme_code          VARCHAR(50),
    category                VARCHAR(100),
    study_mode              VARCHAR(20) CHECK (study_mode IS NULL OR study_mode IN ('full-time', 'part-time')),
    curriculum_version      VARCHAR(100),
    effective_from          VARCHAR(50),
    total_credit_units      NUMERIC(6,1),
    source_path             TEXT NOT NULL,
    source_hash             VARCHAR(64) NOT NULL,
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS curriculum_requirements (
    requirement_key         TEXT PRIMARY KEY,
    plan_key                TEXT NOT NULL REFERENCES curriculum_plans(plan_key) ON DELETE CASCADE,
    parent_requirement_key  TEXT REFERENCES curriculum_requirements(requirement_key) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    requirement_type        VARCHAR(40) NOT NULL CHECK (requirement_type IN (
        'compulsory', 'elective', 'free_elective', 'restricted_elective',
        'specialisation_elective', 'other'
    )),
    minimum_credit_units    NUMERIC(6,1),
    maximum_credit_units    NUMERIC(6,1),
    required_course_count   SMALLINT CHECK (required_course_count IS NULL OR required_course_count > 0),
    selection_rule          VARCHAR(30) NOT NULL CHECK (selection_rule IN (
        'all', 'choose_credit_units', 'choose_courses', 'review_required'
    )),
    rule_text               TEXT,
    sort_order              INT NOT NULL CHECK (sort_order > 0),
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_curriculum_requirement_credit_range CHECK (
        minimum_credit_units IS NULL OR maximum_credit_units IS NULL
        OR maximum_credit_units >= minimum_credit_units
    ),
    CONSTRAINT uq_curriculum_requirement_order UNIQUE (plan_key, sort_order)
);

CREATE TABLE IF NOT EXISTS curriculum_plan_courses (
    plan_course_key         TEXT PRIMARY KEY,
    plan_key                TEXT NOT NULL REFERENCES curriculum_plans(plan_key) ON DELETE CASCADE,
    requirement_key         TEXT NOT NULL REFERENCES curriculum_requirements(requirement_key) ON DELETE CASCADE,
    course_code             VARCHAR(20) NOT NULL,
    source_course_title     TEXT,
    source_credit_units     NUMERIC(6,1),
    status                  VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    sort_order              INT NOT NULL CHECK (sort_order > 0),
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_curriculum_plan_course UNIQUE (requirement_key, course_code, sort_order)
);

CREATE TABLE IF NOT EXISTS curriculum_prerequisite_rules (
    rule_key                TEXT PRIMARY KEY,
    plan_key                TEXT NOT NULL REFERENCES curriculum_plans(plan_key) ON DELETE CASCADE,
    course_code             VARCHAR(20) NOT NULL,
    rule_operator           VARCHAR(20) NOT NULL CHECK (rule_operator IN ('single', 'all', 'any', 'mixed', 'condition')),
    raw_text                TEXT NOT NULL,
    rule_json               JSONB NOT NULL,
    parse_status            VARCHAR(20) NOT NULL CHECK (parse_status IN ('parsed', 'unparsed', 'review_required')),
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS curriculum_prerequisites (
    rule_key                    TEXT NOT NULL REFERENCES curriculum_prerequisite_rules(rule_key) ON DELETE CASCADE,
    prerequisite_course_code    VARCHAR(20) NOT NULL,
    sort_order                  INT NOT NULL CHECK (sort_order > 0),
    last_updated                TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rule_key, prerequisite_course_code)
);

CREATE TABLE IF NOT EXISTS curriculum_course_exclusions (
    plan_key                TEXT NOT NULL REFERENCES curriculum_plans(plan_key) ON DELETE CASCADE,
    course_code             VARCHAR(20) NOT NULL,
    excluded_course_code    VARCHAR(20) NOT NULL,
    raw_text                TEXT,
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_key, course_code, excluded_course_code),
    CONSTRAINT chk_curriculum_exclusion_not_self CHECK (course_code <> excluded_course_code)
);

CREATE TABLE IF NOT EXISTS curriculum_course_presentations (
    plan_key                TEXT NOT NULL REFERENCES curriculum_plans(plan_key) ON DELETE CASCADE,
    course_code             VARCHAR(20) NOT NULL,
    presentation_year       SMALLINT NOT NULL CHECK (presentation_year >= 2000),
    presentation_period     VARCHAR(10) NOT NULL CHECK (presentation_period IN ('January', 'May', 'July')),
    status                  VARCHAR(20) NOT NULL CHECK (status IN ('offered', 'not_offered', 'retired', 'replaced')),
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_key, course_code, presentation_year, presentation_period)
);

CREATE TABLE IF NOT EXISTS curriculum_course_lifecycle_events (
    lifecycle_event_key     TEXT PRIMARY KEY,
    plan_key                TEXT NOT NULL REFERENCES curriculum_plans(plan_key) ON DELETE CASCADE,
    course_code             VARCHAR(20) NOT NULL,
    source_course_title     TEXT,
    status                  VARCHAR(20) NOT NULL CHECK (status IN ('retired', 'replaced')),
    effective_year          SMALLINT CHECK (effective_year IS NULL OR effective_year >= 2000),
    effective_period        VARCHAR(10) CHECK (effective_period IS NULL OR effective_period IN ('January', 'May', 'July')),
    raw_effective_term      TEXT,
    raw_remarks             TEXT,
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS curriculum_course_replacements (
    replacement_key         TEXT PRIMARY KEY,
    plan_key                TEXT NOT NULL REFERENCES curriculum_plans(plan_key) ON DELETE CASCADE,
    old_course_code         VARCHAR(20) NOT NULL,
    new_course_code         VARCHAR(20) NOT NULL,
    effective_year          SMALLINT CHECK (effective_year IS NULL OR effective_year >= 2000),
    effective_period        VARCHAR(10) CHECK (effective_period IS NULL OR effective_period IN ('January', 'May', 'July')),
    raw_text                TEXT,
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_curriculum_replacement_not_self CHECK (old_course_code <> new_course_code)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_requirements_plan
ON curriculum_requirements (plan_key, sort_order);

CREATE INDEX IF NOT EXISTS idx_curriculum_plan_courses_plan
ON curriculum_plan_courses (plan_key, requirement_key, sort_order);

CREATE INDEX IF NOT EXISTS idx_curriculum_plan_courses_course
ON curriculum_plan_courses (course_code);

CREATE INDEX IF NOT EXISTS idx_curriculum_prerequisite_rules_course
ON curriculum_prerequisite_rules (course_code);

CREATE INDEX IF NOT EXISTS idx_curriculum_prerequisites_course
ON curriculum_prerequisites (prerequisite_course_code);

CREATE INDEX IF NOT EXISTS idx_curriculum_exclusions_course
ON curriculum_course_exclusions (course_code);

CREATE INDEX IF NOT EXISTS idx_curriculum_exclusions_excluded_course
ON curriculum_course_exclusions (excluded_course_code);

CREATE INDEX IF NOT EXISTS idx_curriculum_presentations_course
ON curriculum_course_presentations (course_code, presentation_year, presentation_period);

CREATE INDEX IF NOT EXISTS idx_curriculum_lifecycle_course
ON curriculum_course_lifecycle_events (course_code, effective_year, effective_period);

CREATE INDEX IF NOT EXISTS idx_curriculum_replacements_old_course
ON curriculum_course_replacements (old_course_code);

CREATE INDEX IF NOT EXISTS idx_curriculum_replacements_new_course
ON curriculum_course_replacements (new_course_code);

COMMIT;
