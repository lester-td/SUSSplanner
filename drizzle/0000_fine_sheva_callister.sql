CREATE TABLE "admin_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"day" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_hours" integer NOT NULL,
	"class_type" text NOT NULL,
	"venue" text NOT NULL,
	"week_pattern" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"tg" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year" text NOT NULL,
	"term" integer NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_offering_id_module_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."module_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_offerings" ADD CONSTRAINT "module_offerings_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_offerings" ADD CONSTRAINT "module_offerings_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_profiles_user_unique" ON "admin_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_profiles_email_unique" ON "admin_profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "classes_offering_idx" ON "classes" USING btree ("offering_id");--> statement-breakpoint
CREATE UNIQUE INDEX "module_offerings_unique" ON "module_offerings" USING btree ("module_id","semester_id","tg");--> statement-breakpoint
CREATE INDEX "module_offerings_semester_idx" ON "module_offerings" USING btree ("semester_id");--> statement-breakpoint
CREATE INDEX "module_offerings_module_idx" ON "module_offerings" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modules_code_unique" ON "modules" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "semesters_academic_year_term_unique" ON "semesters" USING btree ("academic_year","term");--> statement-breakpoint
CREATE INDEX "semesters_active_idx" ON "semesters" USING btree ("is_active");