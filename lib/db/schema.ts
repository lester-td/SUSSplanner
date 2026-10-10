import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ParseStatus, ReviewStatus, SourceOccurrence, PrerequisiteRuleNode } from "@/lib/data/prerequisites/types";

export const curriculumPlans = pgTable("curriculum_plans", {
  planKey: text("plan_key").primaryKey(),
  programmeName: text("programme_name").notNull(),
  studyMode: text("study_mode").$type<"full-time" | "part-time">(),
  curriculumVersion: text("curriculum_version"), effectiveFrom: text("effective_from"),
  sourcePath: text("source_path").notNull(), sourceHash: text("source_hash").notNull(),
  sourceLabel: text("source_label").notNull(), sourceUrl: text("source_url"),
  publicationStatus: text("publication_status").$type<"unreviewed" | "included" | "excluded">().notNull().default("unreviewed"),
  publicationInputHash: text("publication_input_hash").notNull(), reviewedPublicationInputHash: text("reviewed_publication_input_hash"),
  publicationReviewedBy: text("publication_reviewed_by"), publicationReviewedAt: timestamp("publication_reviewed_at", { withTimezone: true, mode: "string" }), publicationReviewNotes: text("publication_review_notes"),
  lastUpdated: timestamp("last_updated", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, table => [
  check("chk_curriculum_plan_key", sql`${table.planKey} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("chk_curriculum_plan_metadata", sql`btrim(${table.programmeName}) <> '' AND btrim(${table.sourceLabel}) <> '' AND btrim(${table.sourcePath}) <> '' AND ${table.sourceHash} ~ '^[a-f0-9]{64}$' AND (${table.studyMode} IS NULL OR ${table.studyMode} IN ('full-time', 'part-time'))`),
  check("chk_curriculum_publication_decision", sql`
    ${table.publicationInputHash} ~ '^publication-input:v1:[a-f0-9]{64}$' AND (
      (${table.publicationStatus} = 'unreviewed' AND ${table.reviewedPublicationInputHash} IS NULL AND ${table.publicationReviewedBy} IS NULL AND ${table.publicationReviewedAt} IS NULL AND ${table.publicationReviewNotes} IS NULL)
      OR (${table.publicationStatus} IN ('included', 'excluded') AND ${table.reviewedPublicationInputHash} IS NOT NULL AND ${table.reviewedPublicationInputHash} = ${table.publicationInputHash} AND ${table.publicationReviewedBy} IS NOT NULL AND btrim(${table.publicationReviewedBy}) <> '' AND ${table.publicationReviewedAt} IS NOT NULL)
    )`),
]).enableRLS();

export const curriculumPrerequisiteRules = pgTable("curriculum_prerequisite_rules", {
  ruleKey: text("rule_key").primaryKey(), planKey: text("plan_key").notNull().references(() => curriculumPlans.planKey, { onDelete: "restrict" }),
  courseCode: varchar("course_code", { length: 20 }).notNull(), applicabilityKey: text("applicability_key").notNull(), applicabilityLabel: text("applicability_label").notNull(), rawText: text("raw_text").notNull(),
  parseStatus: text("parse_status").$type<ParseStatus>().notNull(), ruleJson: jsonb("rule_json").$type<unknown>(), parserContractVersion: integer("parser_contract_version").notNull(),
  sourceHash: text("source_hash").notNull(), sourceOccurrences: jsonb("source_occurrences").$type<SourceOccurrence[]>().notNull(),
  recordStatus: text("record_status").$type<"active" | "inactive">().notNull().default("active"), reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("pending"),
  reviewInputHash: text("review_input_hash").notNull(), reviewedInputHash: text("reviewed_input_hash"), approvedRuleJson: jsonb("approved_rule_json").$type<PrerequisiteRuleNode>(), approvedRuleHash: text("approved_rule_hash"),
  reviewedBy: text("reviewed_by"), reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }), reviewNotes: text("review_notes"), lastUpdated: timestamp("last_updated", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, table => [
  uniqueIndex("uq_curriculum_prerequisite_scope").on(table.planKey, table.courseCode, table.applicabilityKey),
  index("idx_curriculum_rules_course").on(table.courseCode), index("idx_curriculum_rules_plan").on(table.planKey),
  check("chk_curriculum_rule_identity", sql`${table.courseCode} ~ '^[A-Z0-9]{3,20}$' AND ${table.applicabilityKey} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND ${table.ruleKey} = 'prerequisite:' || ${table.planKey} || ':' || ${table.courseCode} || ':' || ${table.applicabilityKey}`),
  check("chk_curriculum_rule_evidence", sql`btrim(${table.rawText}) <> '' AND btrim(${table.applicabilityLabel}) <> '' AND ${table.parseStatus} IN ('parsed', 'review_required', 'unparsed') AND ${table.parserContractVersion} > 0 AND ${table.sourceHash} ~ '^[a-f0-9]{64}$' AND jsonb_typeof(${table.sourceOccurrences}) = 'array' AND jsonb_array_length(${table.sourceOccurrences}) > 0 AND ${table.recordStatus} IN ('active', 'inactive')`),
  check("chk_curriculum_rule_decision", sql`
    ${table.reviewInputHash} ~ '^review-input:v1:[a-f0-9]{64}$' AND (
      (${table.reviewStatus} = 'pending' AND ${table.reviewedInputHash} IS NULL AND ${table.reviewedBy} IS NULL AND ${table.reviewedAt} IS NULL AND ${table.reviewNotes} IS NULL AND ${table.approvedRuleJson} IS NULL AND ${table.approvedRuleHash} IS NULL)
      OR (${table.reviewStatus} IN ('approved', 'source_only', 'excluded') AND ${table.reviewedInputHash} IS NOT NULL AND ${table.reviewedInputHash} = ${table.reviewInputHash} AND ${table.reviewedBy} IS NOT NULL AND btrim(${table.reviewedBy}) <> '' AND ${table.reviewedAt} IS NOT NULL AND
        ((${table.reviewStatus} = 'approved' AND ${table.approvedRuleJson} IS NOT NULL AND jsonb_typeof(${table.approvedRuleJson}) = 'object' AND ${table.approvedRuleHash} IS NOT NULL AND ${table.approvedRuleHash} ~ '^approved-rule:v1:[a-f0-9]{64}$') OR (${table.reviewStatus} IN ('source_only', 'excluded') AND ${table.approvedRuleJson} IS NULL AND ${table.approvedRuleHash} IS NULL)))
    )`),
]).enableRLS();

export const courses = pgTable("courses", {
  courseCode: varchar("course_code", { length: 20 }).primaryKey(),
  courseName: varchar("course_name", { length: 255 }),
  schoolName: varchar("school_name", { length: 255 }),
  isPostgraduate: boolean("is_postgraduate"),
  courseLevel: varchar("course_level", { length: 50 }),
  creditUnits: numeric("credit_units", { precision: 4, scale: 1, mode: "number" }),
  presentationPattern: text("presentation_pattern"),
  courseSynopsis: text("course_synopsis"),
  courseTopics: jsonb("course_topics").$type<unknown>(),
  learningOutcomes: jsonb("learning_outcomes").$type<unknown>(),
  synopsisUrl: text("synopsis_url"),
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
});

export const semesters = pgTable("semesters", {
  semesterId: bigint("semester_id", { mode: "number" }).primaryKey(),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  semesterNo: smallint("semester_no").notNull(),
  semesterName: varchar("semester_name", { length: 100 }).notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  hasIntakeSchedule: boolean("has_intake_schedule").notNull().default(false),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
});

export const semesterWeeks = pgTable("semester_weeks", {
  weekId: bigint("week_id", { mode: "number" }).primaryKey(),
  semesterId: bigint("semester_id", { mode: "number" }).notNull(),
  weekNo: smallint("week_no").notNull(),
  weekType: varchar("week_type", { length: 20 }).notNull(),
  label: varchar("label", { length: 50 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
});

export const academicCalendarEvents = pgTable("academic_calendar_events", {
  eventId: bigint("event_id", { mode: "number" }).primaryKey(),
  calendarYear: smallint("calendar_year").notNull(),
  audience: varchar("audience", { length: 20 }).notNull(),
  eventTitle: varchar("event_title", { length: 255 }).notNull(),
  eventCategory: varchar("event_category", { length: 50 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  sourceUrl: text("source_url"),
  remarks: text("remarks"),
  sortOrder: integer("sort_order").notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
});

export const academicCalendarEventSemesters = pgTable("academic_calendar_event_semesters", {
  eventId: bigint("event_id", { mode: "number" }).notNull(),
  semesterId: bigint("semester_id", { mode: "number" }).notNull(),
});

export const announcements = pgTable("announcements", {
  announcementId: bigserial("announcement_id", { mode: "number" }).primaryKey(),
  message: text("message").notNull(),
  linkUrl: text("link_url"),
  linkLabel: varchar("link_label", { length: 100 }),
  publishAt: timestamp("publish_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(1),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("chk_announcement_message", sql`btrim(${table.message}) <> ''`),
  check("chk_announcement_dates", sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.publishAt}`),
  check("chk_announcement_link", sql`
    (${table.linkUrl} IS NULL AND ${table.linkLabel} IS NULL)
    OR (${table.linkUrl} IS NOT NULL AND ${table.linkLabel} IS NOT NULL
      AND btrim(${table.linkUrl}) <> '' AND btrim(${table.linkLabel}) <> '')
  `),
  index("idx_announcements_publication").on(table.publishAt, table.sortOrder).where(sql`${table.enabled} = true`),
]).enableRLS();

export const classes = pgTable("classes", {
  classId: bigint("class_id", { mode: "number" }).primaryKey(),
  courseCode: varchar("course_code", { length: 20 }).notNull(),
  semesterId: bigint("semester_id", { mode: "number" }).notNull(),
  scheduleType: varchar("schedule_type", { length: 20 }).notNull(),
  groupCodeType: varchar("group_code_type", { length: 10 }).notNull(),
  groupCode: varchar("group_code", { length: 20 }).notNull(),
  language: varchar("language", { length: 50 }),
  availableAsGsp: boolean("available_as_gsp"),
  isRestricted: boolean("is_restricted"),
  remarks: text("remarks"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
});

export const classEvents = pgTable("class_events", {
  eventId: bigint("event_id", { mode: "number" }).primaryKey(),
  classId: bigint("class_id", { mode: "number" }).notNull(),
  eventKind: varchar("event_kind", { length: 20 }).notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  dayOfWeek: smallint("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  eventMode: varchar("event_mode", { length: 100 }),
  campus: varchar("campus", { length: 255 }),
  remarks: text("remarks"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
});

export const assessmentComponents = pgTable("assessment_components", {
  componentId: bigint("component_id", { mode: "number" }).primaryKey(),
  courseCode: varchar("course_code", { length: 20 }).notNull(),
  scheduleType: varchar("schedule_type", { length: 20 }).notNull(),
  componentName: varchar("component_name", { length: 100 }).notNull(),
  componentGroup: varchar("component_group", { length: 10 }).notNull(),
  assessmentMode: varchar("assessment_mode", { length: 100 }),
  weightPercentage: numeric("weight_percentage", { precision: 5, scale: 2, mode: "number" }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
});

export const vClassEventsWithWeek = pgTable("v_class_events_with_week", {
  eventId: bigint("event_id", { mode: "number" }),
  classId: bigint("class_id", { mode: "number" }),
  courseCode: varchar("course_code", { length: 20 }),
  semesterId: bigint("semester_id", { mode: "number" }),
  scheduleType: varchar("schedule_type", { length: 20 }),
  groupCodeType: varchar("group_code_type", { length: 10 }),
  groupCode: varchar("group_code", { length: 20 }),
  eventKind: varchar("event_kind", { length: 20 }),
  eventDate: date("event_date", { mode: "string" }),
  dayOfWeek: smallint("day_of_week"),
  startTime: time("start_time"),
  endTime: time("end_time"),
  eventMode: varchar("event_mode", { length: 100 }),
  campus: varchar("campus", { length: 255 }),
  remarks: text("remarks"),
  weekId: bigint("week_id", { mode: "number" }),
  weekNo: smallint("week_no"),
  weekType: varchar("week_type", { length: 20 }),
  weekLabel: varchar("week_label", { length: 50 }),
});
