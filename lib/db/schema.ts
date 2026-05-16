import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeUnique: uniqueIndex("modules_code_unique").on(table.code),
  })
);

export const semesters = pgTable(
  "semesters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academicYear: text("academic_year").notNull(),
    term: integer("term").notNull(),
    label: text("label").notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    academicYearTermUnique: uniqueIndex("semesters_academic_year_term_unique").on(
      table.academicYear,
      table.term
    ),
    activeIndex: index("semesters_active_idx").on(table.isActive),
  })
);

export const moduleOfferings = pgTable(
  "module_offerings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    semesterId: uuid("semester_id")
      .notNull()
      .references(() => semesters.id, { onDelete: "cascade" }),
    tg: text("tg").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    offeringUnique: uniqueIndex("module_offerings_unique").on(
      table.moduleId,
      table.semesterId,
      table.tg
    ),
    semesterIndex: index("module_offerings_semester_idx").on(table.semesterId),
    moduleIndex: index("module_offerings_module_idx").on(table.moduleId),
  })
);

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => moduleOfferings.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    startTime: text("start_time").notNull(),
    durationHours: integer("duration_hours").notNull(),
    classType: text("class_type").notNull(),
    venue: text("venue").notNull(),
    weekPattern: text("week_pattern").default("all").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    offeringIndex: index("classes_offering_idx").on(table.offeringId),
  })
);

export const adminProfiles = pgTable(
  "admin_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex("admin_profiles_user_unique").on(table.userId),
    emailUnique: uniqueIndex("admin_profiles_email_unique").on(table.email),
  })
);

export const modulesRelations = relations(modules, ({ many }) => ({
  offerings: many(moduleOfferings),
}));

export const semestersRelations = relations(semesters, ({ many }) => ({
  offerings: many(moduleOfferings),
}));

export const moduleOfferingsRelations = relations(moduleOfferings, ({ one, many }) => ({
  module: one(modules, {
    fields: [moduleOfferings.moduleId],
    references: [modules.id],
  }),
  semester: one(semesters, {
    fields: [moduleOfferings.semesterId],
    references: [semesters.id],
  }),
  classes: many(classes),
}));

export const classesRelations = relations(classes, ({ one }) => ({
  offering: one(moduleOfferings, {
    fields: [classes.offeringId],
    references: [moduleOfferings.id],
  }),
}));
