import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

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

export const classes = pgTable("classes", {
  classId: bigint("class_id", { mode: "number" }).primaryKey(),
  courseCode: varchar("course_code", { length: 20 }).notNull(),
  semesterId: bigint("semester_id", { mode: "number" }).notNull(),
  scheduleType: varchar("schedule_type", { length: 20 }).notNull(),
  groupCodeType: varchar("group_code_type", { length: 10 }).notNull(),
  groupCode: varchar("group_code", { length: 20 }).notNull(),
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
  venue: varchar("venue", { length: 255 }),
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
  venue: varchar("venue", { length: 255 }),
  remarks: text("remarks"),
  weekId: bigint("week_id", { mode: "number" }),
  weekNo: smallint("week_no"),
  weekType: varchar("week_type", { length: 20 }),
  weekLabel: varchar("week_label", { length: 50 }),
});
