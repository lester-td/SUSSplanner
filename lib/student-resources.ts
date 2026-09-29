export type StudentResourceCategory =
  | "Daily Tools"
  | "Canvas & IT"
  | "Academic Planning"
  | "Library & Research"
  | "Careers"
  | "Financial Aid"
  | "Campus & Facilities"
  | "Policies & Forms"
  | "Wellbeing & Support"
  | "Contacts";

export type StudentResource = {
  id: string;
  label: string;
  href: string;
  category: StudentResourceCategory;
  description: string;
  keywords: readonly string[];
  showOnHome?: boolean;
  audience?: readonly string[];
};

export const studentResources = [
  {
    id: "suss-eservices",
    label: "SUSS eServices",
    href: "https://sims1.suss.edu.sg/EService/Student/default.aspx",
    category: "Daily Tools",
    description: "SUSS eServices for enrolment, administration, records, and student transactions.",
    keywords: ["student portal", "portal", "sims", "backpack", "admin", "eservices", "enrolment", "enrollment", "fees", "records", "results", "grades", "transcript", "profile"],
    showOnHome: true,
  },
  {
    id: "canvas",
    label: "Canvas",
    href: "https://canvas.suss.edu.sg/login/saml",
    category: "Daily Tools",
    description: "Canvas LMS for course sites, announcements, assignments, and class materials.",
    keywords: ["canvas lms", "lms", "learning management system", "classes", "assignments", "modules", "course site", "announcements", "quizzes", "calendar", "inbox", "deadlines", "submissions", "lesson"],
    showOnHome: true,
  },
  {
    id: "mymail",
    label: "MyMail",
    href: "https://outlook.office.com/mail/",
    category: "Daily Tools",
    description: "SUSS student email through Outlook and Office 365.",
    keywords: ["email", "outlook", "office 365", "microsoft 365", "mail", "mymail", "student email", "inbox", "webmail"],
    showOnHome: true,
  },
  {
    id: "learnova",
    label: "Learnova",
    href: "https://learnova.suss.edu.sg/d2l/login",
    category: "Daily Tools",
    description: "SUSS Learnova learning platform.",
    keywords: ["learnova", "learning", "d2l", "course materials", "classes"],
    showOnHome: true,
  },
  {
    id: "digital-passport",
    label: "Digital Passport",
    href: "https://nucleus.accredify.io/user/login",
    category: "Academic Planning",
    description: "Access your digital academic credentials and records.",
    keywords: ["digital passport", "accredify", "credentials", "certificates", "academic records"],
  },
  {
    id: "library",
    label: "SUSS Library",
    href: "https://library.suss.edu.sg/",
    category: "Library & Research",
    description: "Library homepage for research help, facilities, services, and library updates.",
    keywords: ["library", "research", "books", "articles", "journal", "journals", "database", "databases", "study space", "opening hours", "resources"],
    showOnHome: true,
  },
  {
    id: "career-portal",
    label: "Career Portal",
    href: "https://susscareerportal.suss.edu.sg/suss#step3",
    category: "Careers",
    description: "Career portal for opportunities, career tools, and Kinobi services.",
    keywords: ["career", "kinobi", "jobs", "resume", "cv", "internship", "employment", "job portal", "career portal", "cover letter", "interview"],
  },
  {
    id: "ismartguide",
    label: "iSmartGuide",
    href: "https://isg.suss.edu.sg/user/login",
    category: "Daily Tools",
    description: "iSmartGuide course and study guidance resources.",
    keywords: ["isg", "i smart guide", "ismart guide", "study guide", "istudyguide", "course guide", "study plan", "learning guide"],
    showOnHome: true,
  },
  {
    id: "adles",
    label: "ADLes Adaptive Learning System",
    href: "https://adles.suss.edu.sg/",
    category: "Canvas & IT",
    description: "ADLeS platform for SUSS learning services.",
    keywords: ["adles", "learning", "platform", "e-learning", "online learning", "courseware"],
  },
  {
    id: "minors-overview",
    label: "Minors Overview",
    href: "https://www.suss.edu.sg/academics/programmes/part-time-undergraduate/minor",
    category: "Academic Planning",
    description: "Overview of SUSS minors for undergraduate students.",
    keywords: ["minor", "minors", "undergraduate", "programme", "program", "specialisation", "specialization", "electives"],
  },
  {
    id: "suss-curriculum",
    label: "SUSS Curriculum",
    href: "https://www.suss.edu.sg/academics/why-suss/suss-curriculum",
    category: "Academic Planning",
    description: "Information about the SUSS curriculum structure.",
    keywords: ["new curriculum", "curriculum", "common curriculum", "degree", "graduation requirements", "programme structure", "program structure", "core courses"],
  },
  {
    id: "credit-waivers",
    label: "Credit Waiver & Exemption",
    href: "https://www.suss.edu.sg/life-at-suss/onboarding/matriculation/credit-waivers-credit-recognitions",
    category: "Academic Planning",
    description: "Credit waiver and credit recognition information for prior learning or completed studies.",
    keywords: ["credit waiver", "credit recognition", "exemption", "transfer credit", "cr", "recognition", "prior learning", "course exemption", "financial aid"],
  },
  {
    id: "library-search",
    label: "Library Search",
    href: "https://search.library.suss.edu.sg/discovery/search?vid=65SUSS_INST:SUSS&lang=en",
    category: "Library & Research",
    description: "Search the SUSS Library catalogue and discovery system.",
    keywords: ["library search", "catalogue", "catalog", "primo", "discovery", "books", "articles", "journal", "journals", "ebook", "e-book"],
  },
  {
    id: "databases-az",
    label: "Databases A-Z",
    href: "https://libguides.suss.edu.sg/az/databases",
    category: "Library & Research",
    description: "A-Z list of SUSS Library databases.",
    keywords: ["databases", "database", "a-z", "az", "research", "journals", "articles", "academic sources", "library databases"],
  },
  {
    id: "research-guides",
    label: "Research Guides",
    href: "https://libguides.suss.edu.sg/researchguides",
    category: "Library & Research",
    description: "Research guides for subjects, tools, and academic sources.",
    keywords: ["research guides", "libguides", "sources", "citation", "referencing", "apa", "research help", "subject guide"],
  },
  {
    id: "librarian-consultation",
    label: "Library Consultation",
    href: "https://suss.libcal.com/appointments/suss/online-consultations",
    category: "Library & Research",
    description: "Book an online consultation with a SUSS librarian.",
    keywords: ["librarian", "consultation", "appointment", "research help", "library help", "book librarian", "research consultation"],
  },
  {
    id: "library-opening-hours",
    label: "Library Opening Hours",
    href: "https://library.suss.edu.sg/opening-hours",
    category: "Library & Research",
    description: "SUSS Library opening hours.",
    keywords: ["library hours", "opening hours", "operating hours", "library timing", "closing time", "open today"],
  },
  {
    id: "library-faq",
    label: "Library FAQ",
    href: "https://libanswers.suss.edu.sg/",
    category: "Library & Research",
    description: "Answers to common questions about SUSS Library services and resources.",
    keywords: ["library faq", "library help", "library questions", "research help"],
  },
  {
    id: "financial-aid",
    label: "Financial Aid",
    href: "https://www.suss.edu.sg/admissions/financial-matters/financial-aid",
    category: "Financial Aid",
    description: "Financial aid, bursary, and loan information for SUSS students.",
    keywords: ["financial aid", "full-time", "part-time", "undergraduate", "bursary", "loan", "fees", "tuition", "subsidy", "grant", "funding", "money"],
  },
  {
    id: "external-scholarships-awards",
    label: "External Scholarships & Awards",
    href: "https://www.suss.edu.sg/admissions/financial-matters/scholarships-sponsorships/full-time-undergraduate#scholarships-sponsorships",
    category: "Financial Aid",
    description: "Scholarships and awards information for undergraduate students.",
    keywords: ["scholarship", "scholarships", "award", "awards", "financial aid", "external scholarships", "sponsorship", "funding", "tuition"],
  },
  {
    id: "discussion-room-booking",
    label: "Discussion Room Booking",
    href: "https://suss.libcal.com/spaces",
    category: "Daily Tools",
    description: "Book SUSS Library discussion rooms and study spaces.",
    keywords: ["discussion room", "room booking", "study room", "libcal", "spaces", "library room", "meeting room", "book room", "reserve room"],
    showOnHome: true,
  },
  {
    id: "success-gateway",
    label: "Success Gateway",
    href: "https://www.campusgroups.com/shibboleth/login?idp=suss&school=suss",
    category: "Daily Tools",
    description: "SUSS Success Gateway for student activities, communities, and opportunities.",
    keywords: ["success gateway", "campus groups", "student activities", "communities", "opportunities"],
    showOnHome: true,
  },
  {
    id: "campus-map-facilities",
    label: "Campus Map and Facilities",
    href: "https://www.suss.edu.sg/about-suss/resources/campus-location-and-facilities",
    category: "Campus & Facilities",
    description: "Campus location, directions, map, and facilities.",
    keywords: ["campus map", "location", "facilities", "directions", "address", "transport", "parking", "bus", "mrt", "map"],
  },
  {
    id: "psea-withdrawal-form",
    label: "PSEA Withdrawal Form",
    href: "https://form.gov.sg/686beddd68398fdc1e3058b0",
    category: "Policies & Forms",
    description: "PSEA withdrawal form on FormSG.",
    keywords: ["psea", "withdrawal", "form", "formsg", "fees", "post-secondary education account", "payment", "tuition"],
  },
  {
    id: "c-three-support",
    label: "Counselling and Life Coaching (C-Three)",
    href: "https://www.suss.edu.sg/life-at-suss/health-safety/counselling-life-coaching",
    category: "Wellbeing & Support",
    description: "SUSS counselling and life coaching services.",
    keywords: ["c-three", "cthree", "c3", "counselling", "counseling", "life coaching", "booking", "wellbeing", "mental health", "support", "stress"],
  },
  {
    id: "writing-coaches",
    label: "Writing Coaches",
    href: "https://www.suss.edu.sg/academics/schools-college/english-language-support-programmes/writing-coaches",
    category: "Wellbeing & Support",
    description: "Writing coaching and English language support.",
    keywords: ["writing coach", "writing coaches", "english support", "academic writing", "essay", "report writing", "grammar", "language support"],
  },
  {
    id: "teaching-learning-centre",
    label: "Teaching & Learning Centre (TLC)",
    href: "https://www.suss.edu.sg/about/engagement-collaboration/centres/teaching-learning-centre",
    category: "Wellbeing & Support",
    description: "Information about SUSS teaching and learning support.",
    keywords: ["teaching and learning centre", "tlc", "learning support", "teaching"],
  },
  {
    id: "mindline",
    label: "Mindline.sg",
    href: "https://www.mindline.sg/landing",
    category: "Wellbeing & Support",
    description: "Mindline.sg mental wellness and support resource.",
    keywords: ["mindline", "mental health", "wellness", "wellbeing", "support", "stress", "anxiety", "self care", "counselling", "counseling"],
  },
  {
    id: "academic-calendars-all",
    label: "Academic Calendar",
    href: "https://www.suss.edu.sg/life-at-suss/onboarding/matriculation/academic-calendar",
    category: "Academic Planning",
    description: "Academic calendars for full-time, part-time, law, and graduate programmes.",
    keywords: ["academic calendar", "calendar", "term dates", "semester dates", "full-time", "part-time", "law", "graduate", "school term", "vacation", "study week", "exam week", "public holiday"],
  },
  {
    id: "student-handbook",
    label: "Student Handbook",
    href: "https://sussconnect.suss.edu.sg/topics/4520/media_center/folder/01d2ab6e-ff4c-4fd9-a4c2-dedb34a3db4e",
    category: "Policies & Forms",
    description: "Student handbook in SUSS Connect.",
    keywords: ["student handbook", "suss connect", "student policies", "student information"],
  },
  {
    id: "career-development-info",
    label: "SUSS Career Development Info",
    href: "https://www.suss.edu.sg/life-at-suss/student-experiences/career-development",
    category: "Careers",
    description: "SUSS career development programmes and services.",
    keywords: ["career development", "career services", "employment", "internship", "career advice"],
  },
  {
    id: "elevate-suss",
    label: "Elevate@SUSS (Mentoring & Coaching)",
    href: "https://suss.seemementor.com/saml2/4b7072a2a-3edf-ad8a-25c7-a9ef18e4df8/login",
    category: "Careers",
    description: "Elevate@SUSS mentoring and coaching platform.",
    keywords: ["elevate", "mentoring", "coaching", "career", "mentor"],
  },
  {
    id: "student-services-support",
    label: "Student Services / Student Support",
    href: "mailto:students@suss.edu.sg",
    category: "Contacts",
    description: "Email student services and student support.",
    keywords: ["student services", "student support", "students", "email", "help", "enquiry", "enquiries", "admin support", "contact"],
  },
  {
    id: "career-development-contact",
    label: "Career Development",
    href: "mailto:careerdev@suss.edu.sg",
    category: "Contacts",
    description: "Email Career Development.",
    keywords: ["career development", "careerdev", "email", "career", "jobs", "internship", "resume", "cv", "contact"],
  },
  {
    id: "financial-aid-contact",
    label: "Financial Aid Contact",
    href: "mailto:financialaid@suss.edu.sg",
    category: "Contacts",
    description: "Email Financial Aid.",
    keywords: ["financial aid", "financialaid", "email", "bursary", "loan", "fees", "tuition", "contact"],
  },
  {
    id: "canvas-lms-support",
    label: "Canvas LMS Support",
    href: "mailto:lms_support@suss.edu.sg",
    category: "Contacts",
    description: "Email Canvas LMS support.",
    keywords: ["canvas", "lms support", "lms_support", "email", "technical support", "login", "course site", "assignment issue"],
  },
  {
    id: "mymail-support",
    label: "MyMail Support",
    href: "mailto:mymail_support@suss.edu.sg",
    category: "Contacts",
    description: "Email MyMail support.",
    keywords: ["mymail", "mail support", "mymail_support", "email", "outlook", "office 365", "microsoft 365", "login", "password"],
  },
  {
    id: "it-helpdesk",
    label: "IT Helpdesk",
    href: "mailto:ithelpdesk@suss.edu.sg",
    category: "Contacts",
    description: "Email the IT Helpdesk.",
    keywords: ["it helpdesk", "it support", "technology", "email", "password", "login", "account", "wifi", "technical support"],
  },
] as const satisfies readonly StudentResource[];

export const studentResourceCategories = [
  "Daily Tools",
  "Canvas & IT",
  "Academic Planning",
  "Library & Research",
  "Careers",
  "Financial Aid",
  "Campus & Facilities",
  "Policies & Forms",
  "Wellbeing & Support",
  "Contacts",
] as const satisfies readonly StudentResourceCategory[];

const homeQuickResourceIds = [
  "suss-eservices",
  "mymail",
  "canvas",
  "learnova",
  "ismartguide",
  "library",
  "discussion-room-booking",
  "success-gateway",
] as const;

export const homeQuickResources = homeQuickResourceIds.map((resourceId) => {
  const resource = studentResources.find((item) => item.id === resourceId);

  if (!resource)
  {
    throw new Error(`Missing home quick resource: ${resourceId}`);
  }

  return resource;
});
