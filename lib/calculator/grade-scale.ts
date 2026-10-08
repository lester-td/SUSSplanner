export const GRADE_BANDS: Array<{ grade: string; minimum: number }> = [
  { grade: "A+", minimum: 85 },
  { grade: "A", minimum: 80 },
  { grade: "A-", minimum: 75 },
  { grade: "B+", minimum: 70 },
  { grade: "B", minimum: 65 },
  { grade: "B-", minimum: 60 },
  { grade: "C+", minimum: 55 },
  { grade: "C", minimum: 50 },
  { grade: "D+", minimum: 45 },
  { grade: "D", minimum: 40 },
  { grade: "F", minimum: 0 },
];

export const GRADE_POINT_VALUES: Record<string, number> = {
  "A+": 5,
  A: 5,
  "A-": 4.5,
  "B+": 4,
  B: 3.5,
  "B-": 3,
  "C+": 2.5,
  C: 2,
  "D+": 1.5,
  D: 1,
  F: 0,
};

export function formatGradeRange(index: number)
{
  const band = GRADE_BANDS[index];

  if (index === 0)
  {
    return `${band.minimum}–100%`;
  }

  if (index === GRADE_BANDS.length - 1)
  {
    return `0–${GRADE_BANDS[index - 1].minimum - 1}%`;
  }

  return `${band.minimum}–${GRADE_BANDS[index - 1].minimum - 1}%`;
}
