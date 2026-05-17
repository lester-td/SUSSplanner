const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

function requireEnv(name)
{
  const value = process.env[name];
  if (!value)
  {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeAcademicYear(value)
{
  const trimmed = String(value || "").trim();
  if (trimmed)
  {
    return trimmed;
  }

  const currentYear = new Date().getFullYear();
  return `${currentYear}/${currentYear + 1}`;
}

function toClockValue(compactTime)
{
  const digits = String(compactTime || "").trim();
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function toDurationHours(start, end)
{
  const [startHours, startMinutes] = toClockValue(start).split(":").map(Number);
  const [endHours, endMinutes] = toClockValue(end).split(":").map(Number);
  return (endHours * 60 + endMinutes - (startHours * 60 + startMinutes)) / 60;
}

async function main()
{
  const sql = postgres(requireEnv("DATABASE_URL"), { prepare: false });

  try
  {
    const samplePath = path.join(__dirname, "..", "backend", "sampleModules.json");
    const sampleModules = JSON.parse(fs.readFileSync(samplePath, "utf8"));

    const academicYear = normalizeAcademicYear(process.env.SEED_ACADEMIC_YEAR);
    const term = Number(process.env.SEED_TERM || 1);
    const semesterLabel = process.env.SEED_SEMESTER_LABEL || `AY ${academicYear} Semester ${term}`;
    const replaceExisting = process.env.SEED_REPLACE_EXISTING !== "false";

    await sql.begin(async (tx) => {
      await tx`
        update semesters
        set is_active = false, updated_at = now()
      `;

      const [semester] = await tx`
        insert into semesters (academic_year, term, label, is_active)
        values (${academicYear}, ${term}, ${semesterLabel}, true)
        on conflict (academic_year, term)
        do update set
          label = excluded.label,
          is_active = excluded.is_active,
          updated_at = now()
        returning id, academic_year, term, label, is_active
      `;

      for (const moduleEntry of sampleModules)
      {
        const rootCode = String(moduleEntry.code || "")
          .trim()
          .toUpperCase()
          .replace(/-TG\d+$/i, "")
          .replace(/TG\d+$/i, "");
        const tg = String(moduleEntry.tg || "TG01").trim().toUpperCase();
        const moduleName = String(moduleEntry.name || rootCode).trim() || rootCode;
        const moduleColor = moduleEntry.color ? String(moduleEntry.color).toLowerCase() : null;

        const [moduleRecord] = await tx`
          insert into modules (code, name)
          values (${rootCode}, ${moduleName})
          on conflict (code)
          do update set
            name = excluded.name,
            updated_at = now()
          returning id, code, name
        `;

        const [offeringRecord] = await tx`
          insert into module_offerings (module_id, semester_id, tg, color)
          values (${moduleRecord.id}, ${semester.id}, ${tg}, ${moduleColor})
          on conflict (module_id, semester_id, tg)
          do update set
            color = excluded.color,
            updated_at = now()
          returning id
        `;

        if (replaceExisting)
        {
          await tx`
            delete from classes
            where offering_id = ${offeringRecord.id}
          `;
        }

        for (const lesson of moduleEntry.lessons || [])
        {
          const startTime = toClockValue(lesson.start);
          const durationHours = toDurationHours(lesson.start, lesson.end);
          await tx`
            insert into classes (
              offering_id,
              day,
              start_time,
              duration_hours,
              class_type,
              venue,
              week_pattern
            )
            values (
              ${offeringRecord.id},
              ${lesson.day},
              ${startTime},
              ${durationHours},
              ${String(lesson.type || "LEC")},
              ${String(lesson.venue || "TBA")},
              ${String(lesson.weekPattern || "all")}
            )
          `;
        }
      }
    });

    console.log(`Seeded sample module data into the active semester (${academicYear}, term ${term}).`);
  }
  finally
  {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
