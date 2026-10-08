export function inferCatalogSemesterSpan(courseCode: string)
{
  const normalizedCode = courseCode.trim().toUpperCase();

  if (
    normalizedCode === "NIE301"
    || normalizedCode === "NIE351"
    || normalizedCode.endsWith("499")
  )
  {
    return 2;
  }

  return 1;
}
