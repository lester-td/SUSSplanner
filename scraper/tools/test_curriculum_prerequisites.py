import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
import parse_curriculum_plans as curriculum

FIXTURES = json.loads((Path(__file__).parent / "fixtures/curriculum_prerequisites.json").read_text())
LOGICAL_FIXTURES = json.loads((Path(__file__).parent / "fixtures/curriculum_logical_expressions.json").read_text())
PLAN = {"planKey": "fixture-plan", "programmeName": "Fixture programme", "category": "undergraduate", "studyMode": "full-time", "sourcePath": "fixture.pdf", "sourceHash": "a" * 64, "courseLikeRowCount": 4, "entryCount": 4, "pageCount": 100}
def source_entry(code, text):
    return {"planKey": PLAN["planKey"], "courseCode": code, "courseTitle": "Fixture course", "recordType": "offering", "section": "Core", "prerequisite": text, "sourcePage": 1, "sourceTable": 2, "sourceRow": 3, "warnings": []}

class CurriculumPrerequisiteTests(unittest.TestCase):
    def test_unambiguous_expressions_and_suffixes(self):
        for text, kind, codes in [("ABC123", "course", ["ABC123"]), ("BUS557Ae", "course", ["BUS557AE"]), ("CDO303ACI", "course", ["CDO303ACI"]), ("abc123 and DEF234", "all", ["ABC123", "DEF234"]), ("ABC123 & DEF234", "all", ["ABC123", "DEF234"]), ("ABC123 or DEF234", "any", ["ABC123", "DEF234"])]:
            with self.subTest(text=text):
                _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertEqual(status, "parsed")
                self.assertEqual(rule["type"], kind)
                self.assertEqual(curriculum.prerequisite_rule_codes(rule), codes)

    def test_unsupported_wording_is_not_guessed(self):
        for text in ["ABC123; DEF234", "ABC123 or DEF234 and GHI345", "ABC123 and DEF234 or GHI345", "ABC123, DEF234 or GHI345", "ABC123/BUS101", "ABC123 + BUS101", "ABC123 with a minimum grade of B", "ABC123 and two years of experience", "Two of ABC123, DEF234, GHI345", "ABC123 or", "and ABC123", "ABC123 or or DEF234", "ABC123 DEF234", "ABC123 and ABC123", "abc123 and ABC123", "Departmental approval", "20 cu", "(cid:14) ABC123"]:
            with self.subTest(text=text):
                _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertNotEqual(status, "parsed")
                self.assertIsNone(rule)

    def test_explicit_pairs_and_comma_conjunction_preserve_the_exact_logic(self):
        course = lambda code: {"type": "course", "courseCode": code}
        pair = lambda left, right: {"type": "all", "children": [course(left), course(right)]}
        text = "ENG201 and ENG203 or ENG201 and ENG311 or ENG203 and ENG311"
        _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
        self.assertEqual(status, "parsed")
        self.assertEqual(rule, {"type": "any", "children": [pair("ENG201", "ENG203"), pair("ENG201", "ENG311"), pair("ENG203", "ENG311")]})
        models = curriculum.build_product_models([PLAN], [source_entry("ZZZ999", text)], [])
        self.assertEqual(models["prerequisiteRules"][0]["rule"], rule)
        self.assertEqual([item["prerequisiteCourseCode"] for item in models["prerequisites"]], ["ENG201", "ENG203", "ENG311"])
        text = "ENG101, ENG103 and (ICT133 or ICT162)"
        _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
        self.assertEqual(status, "parsed")
        self.assertEqual(rule, {"type": "all", "children": [{"type": "any", "children": [course("ICT133"), course("ICT162")]}, course("ENG101"), course("ENG103")]})
        entry = source_entry("ZZZ999", text)
        curriculum.attach_prerequisite_candidate(entry)
        self.assertEqual(entry["prerequisite"], text)
        self.assertEqual(entry["prerequisiteDiagnostics"], [])

    def test_parentheses_oxford_commas_and_shared_alternative_courses(self):
        for text, kind in [("ABC123 or (DEF234 and GHI345)", "any"), ("(ABC123 or DEF234)", "any"), ("(ABC123)", "course"), ("ABC123, DEF234 and GHI345", "all"), ("ABC123, DEF234, and GHI345", "all"), ("ABC123, DEF234 & GHI345", "all"), ("(ABC123 or DEF234) and (GHI345 or JKL456)", "all"), ("ABC123 & DEF234 OR ABC123 & GHI345", "any"), ("(ABC123 and DEF234) or GHI345", "any")]:
            with self.subTest(text=text):
                entry = source_entry("ZZZ999", text)
                curriculum.attach_prerequisite_candidate(entry)
                self.assertEqual(entry["parseStatus"], "parsed")
                self.assertEqual(entry["parserRule"]["type"], kind)
                self.assertEqual(entry["prerequisiteDiagnostics"], [])

    def test_shared_logical_fixtures_match_the_application_contract(self):
        for fixture in LOGICAL_FIXTURES:
            with self.subTest(course=fixture["courseCode"]):
                entry = source_entry(fixture["courseCode"], fixture["rawText"])
                curriculum.attach_prerequisite_candidate(entry)
                self.assertEqual(entry["parseStatus"], "parsed")
                self.assertEqual(entry["parserRule"], fixture["rule"])
                if fixture["courseCode"] == "ACC353":
                    self.assertTrue(any("Either grouping" in message for message in entry["prerequisiteDiagnostics"]))
                else:
                    self.assertEqual(entry["prerequisiteDiagnostics"], [])

    def test_malformed_repeated_choices_and_oversized_groups_are_rejected(self):
        for text in ["()", "(ABC123 or DEF234", "ABC123 or DEF234)", "ABC123 (DEF234)", "ABC123 and ()", "ABC123, and", "ABC123, , DEF234 and GHI345", "ABC123 and (DEF234 or)", "ABC123 and (ABC123)", "(ABC123 and DEF234) or (DEF234 and ABC123)", "(" * 9 + "ABC123" + ")" * 9, " and ".join(f"ABC{number:03}" for number in range(100, 133)), " or ".join(f"(ABC{number:03} and DEF{number:03})" for number in range(100, 122))]:
            with self.subTest(text=text):
                _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertNotEqual(status, "parsed")
                self.assertIsNone(rule)

    def test_corpus_conditions_and_concurrency_retain_original_text_without_edges(self):
        for fixture in FIXTURES:
            entry = source_entry(fixture["courseCode"], fixture["prerequisite"])
            models = curriculum.build_product_models([PLAN], [entry], [])
            if fixture["courseCode"] in {"FIN559", "MLL381"}:
                rule = models["prerequisiteRules"][0]["rule"]
                self.assertEqual(rule["type"], "any")
                self.assertTrue(any(child["type"] == "condition" for child in rule["children"]))
                self.assertEqual(set(curriculum.prerequisite_rule_codes(rule)), set(fixture["courseCodes"]))
            else:
                self.assertIsNone(models["prerequisiteRules"][0]["rule"])
                self.assertEqual(models["prerequisites"], [])
            self.assertEqual(models["prerequisiteRules"][0]["rawText"], fixture["prerequisite"])

    def test_audit_failure_fixtures(self):
        for code, text in [("ECE598", "Completed a minimum of 30 cu including ECE501"), ("LAW498", "LAW401, except students may take LAW401 concurrently")]:
            entry = source_entry(code, text)
            curriculum.attach_prerequisite_candidate(entry)
            self.assertEqual(entry["parseStatus"], "review_required")
            self.assertIsNone(entry["parserRule"])
            self.assertEqual(entry["prerequisite"], text)

    def test_commas_code_spacing_completion_and_either_groups(self):
        for text, expected in [("ACC201, BUS201, BUS205, ACC305", ["ACC201", "ACC305", "BUS201", "BUS205"]), ("(BME107,B ME108) or (BME209,B ME210) or BME207", ["BME107", "BME108", "BME209", "BME210", "BME207"]), ("MTH219, MTH220, or HBC201 and HBC203", ["HBC201", "HBC203", "MTH219", "MTH220"]), ("Completion of COU571 and COU575", ["COU571", "COU575"]), ("To read all 3: COU502, COU504 and COU506", ["COU502", "COU504", "COU506"])]:
            with self.subTest(text=text):
                _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertEqual(status, "parsed")
                self.assertEqual(curriculum.prerequisite_rule_codes(rule), expected)
        entry = source_entry("ACC353", "ANL303 and either (ACC201 and ACC203) or ACC202")
        curriculum.attach_prerequisite_candidate(entry)
        self.assertEqual(entry["parseStatus"], "parsed")
        self.assertEqual(entry["parserRule"]["type"], "all")
        self.assertEqual(next(child for child in entry["parserRule"]["children"] if child["type"] == "any")["children"][0]["type"], "all")
        self.assertTrue(any("Either grouping" in message for message in entry["prerequisiteDiagnostics"]))
        self.assertEqual(curriculum.repair_course_code_spacing("HB C105, B ME108, HD S501 AND ICT 133 OR ANL252"), "HBC105, BME108, HDS501 AND ICT133 OR ANL252")
        self.assertEqual(curriculum.repair_course_code_spacing("PSY3 92 and ENG20 1"), "PSY392 and ENG201")

    def test_numbered_choices_and_credits_keep_every_required_clause(self):
        text = "Completed 20 cu, including ANL501, ANL503 and TWO (2) of the following courses: ANL505, ANL507, ANL509"
        _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
        self.assertEqual(status, "parsed")
        self.assertEqual(rule["type"], "all")
        self.assertIn({"type": "condition", "text": "Completed 20 cu"}, rule["children"])
        choice = next(child for child in rule["children"] if child["type"] == "nOf")
        self.assertEqual(choice["count"], 2)
        self.assertEqual(curriculum.prerequisite_rule_codes(choice), ["ANL505", "ANL507", "ANL509"])
        self.assertEqual(set(curriculum.prerequisite_rule_codes(rule)), {"ANL501", "ANL503", "ANL505", "ANL507", "ANL509"})
        for text in ["ANL501 and TWO (3) of the following courses: ANL505, ANL507, ANL509", "ANL501 and TWO (2) of the following courses: ANL501, ANL507", "ANL501 and 4 of the following courses: ANL505, ANL507, ANL509", "Completed 20 cu, including ANL501 and concurrent ANL503", "To read all 3: COU502, COU504"]:
            self.assertIsNone(curriculum.prerequisite_rule(text, curriculum.course_codes(text))[2])

    def test_course_group_conditions_do_not_invent_course_membership(self):
        for text, leaves in [("All Compulsory SWK Level 100, 200 courses and SWK391.", ["SWK391"]), ("All Compulsory SWK Level 100, 200 courses , SWK391 and (SWK485 or SWK487)", ["SWK485", "SWK487", "SWK391"]), ("All MCOU compulsory courses, HDS501 or RSS503, and CGPA of 3.8", ["HDS501", "RSS503"])]:
            with self.subTest(text=text):
                _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertEqual(status, "parsed")
                self.assertEqual(rule["type"], "all")
                self.assertEqual(curriculum.prerequisite_rule_codes(rule), leaves)
                self.assertTrue(any(child["type"] == "condition" for child in rule["children"]))

    def test_same_row_remarks_are_followed_without_overwriting_original_cells(self):
        entry = source_entry("ELT379", "See Remarks.")
        entry["remarks"] = "To take after completing Levels 1 and 2 compulsory literature courses."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertEqual(entry["prerequisite"], "See Remarks.")
        self.assertEqual(entry["prerequisiteEvidenceText"], "See Remarks.\nRemarks: " + entry["remarks"])
        self.assertEqual(entry["prerequisiteNormalizedText"], entry["remarks"])
        self.assertIsNone(entry["parserRule"])
        for remark, status in [("ABC123, DEF234", "parsed"), ("ABC123, except DEF234 may be taken concurrently", "review_required"), (None, "review_required")]:
            entry = source_entry("ZZZ999", "See Remarks.")
            entry["remarks"] = remark
            curriculum.attach_prerequisite_candidate(entry)
            self.assertEqual(entry["parseStatus"], status)
            if status != "parsed": self.assertIsNone(entry["parserRule"])
        entry = source_entry("SCM488", "Students must meet the minimum credit requirements to take SCM488. Please refer to remarks for more details")
        entry["remarks"] = "100 cu before 2023/07 intakes; 90 cu afterwards."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertIn(entry["remarks"], entry["prerequisiteEvidenceText"])
        self.assertFalse(any("Self-reference" in message for message in entry["prerequisiteDiagnostics"]))

    def test_self_references_repeated_tokens_and_glyphs_are_diagnostic(self):
        for code, text, diagnostic in [("ABC123", "abc123", "Self-reference"), ("ZZZ999", "ABC123 and ABC123", "Repeated raw"), ("ZZZ999", "(cid:14) ABC123", "Unresolved")]:
            entry = source_entry(code, text)
            curriculum.attach_prerequisite_candidate(entry)
            self.assertEqual(entry["parseStatus"], "review_required")
            self.assertIsNone(entry["parserRule"])
            self.assertTrue(any(diagnostic in warning for warning in entry["prerequisiteDiagnostics"]))

    def test_source_entries_carry_version_result_and_original_coordinates(self):
        entry = source_entry("ZZZ999", "ABC123")
        original = deepcopy(entry)
        curriculum.build_product_models([PLAN], [entry], [])
        for key in original:
            self.assertEqual(entry[key], original[key])
        self.assertEqual(entry["parserContractVersion"], 2)
        self.assertEqual(entry["parserRule"], {"type": "course", "courseCode": "ABC123"})

    def test_experimental_sql_is_guarded_and_rejects_self_edges(self):
        models = curriculum.build_product_models([PLAN], [source_entry("ZZZ999", "ABC123")], [])
        self.assertIn("Experimental importer cannot modify reviewed prerequisites", curriculum.generate_sql(models))
        models["prerequisites"][0]["prerequisiteCourseCode"] = "ZZZ999"
        with self.assertRaisesRegex(ValueError, "Self-prerequisite"):
            curriculum.generate_sql(models)

    def test_main_publishes_parser_contract_source_candidates_and_issues(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "input").mkdir()
            (root / "input/fixture.pdf").touch()
            entries = [source_entry(item["courseCode"], item["prerequisite"]) for item in FIXTURES]
            argv = ["parse_curriculum_plans.py", "--input-dir", str(root / "input"), "--json", str(root / "result.json"), "--out", str(root / "result.sql"), "--issues-out", str(root / "issues.tsv")]
            with patch("sys.argv", argv), patch.object(curriculum, "parse_plan", return_value=(PLAN, entries, [])):
                curriculum.main()
            payload = json.loads((root / "result.json").read_text())
            self.assertEqual(payload["metadata"]["parserContractVersion"], 2)
            self.assertEqual(payload["metadata"]["issueCount"], 2)
            self.assertTrue(all("parserRule" in entry for entry in payload["review"]["sourceEntries"]))
            self.assertEqual(sum(rule["rule"] is None for rule in payload["prerequisiteRules"]), 2)

    def test_remarks_only_completion_requirements_create_trees_without_mutating_cells(self):
        for code, remarks, expected in [("CTI301", "To take after CTI205 and CTI207.", ["CTI205", "CTI207"]), ("ELG217", "To take after completing ELG101.", ["ELG101"]), ("ELT201", "To take after completing ELT107. ELT201 replaces ELT109.", ["ELT107"]), ("CTI302", "CTI-Major students: To take after CTI205 and CTI207. Audio- recording equipment is required.", ["CTI205", "CTI207"])]:
            with self.subTest(code=code):
                entry = source_entry(code, None)
                entry["remarks"] = remarks
                original = deepcopy(entry)
                models = curriculum.build_product_models([PLAN], [entry], [])
                for key in original:
                    self.assertEqual(entry[key], original[key])
                self.assertEqual(entry["prerequisiteSourceFields"], ["remarks"])
                self.assertEqual(entry["prerequisiteEvidenceText"], "Remarks: " + remarks)
                self.assertEqual(entry["parseStatus"], "parsed")
                self.assertEqual(curriculum.prerequisite_rule_codes(entry["parserRule"]), expected)
                self.assertEqual(len(models["prerequisiteRules"]), 1)
                self.assertEqual([edge["prerequisiteCourseCode"] for edge in models["prerequisites"]], expected)
                if len(expected) == 1:
                    self.assertEqual(models["prerequisiteRules"][0]["operator"], "single")
                if code == "CTI302":
                    self.assertEqual(entry["parserRule"]["displayRemarks"], ["CTI-Major students: To take after CTI205 and CTI207."])
                else:
                    self.assertNotIn("displayRemarks", entry["parserRule"])

    def test_remarks_are_checked_without_see_remarks_and_qualify_existing_trees(self):
        for code, prerequisite, remarks, parsed in [("ANL305", "ANL303", "ANL305 can be taken in the same semester as ANL303.", False), ("PSY413", "PSY461", "To take this course, students must have completed or be taking PSY461 in the same semester.", False), ("FIN523", "Prior learning in financial management or FIN549", "Students can take FIN523 and FIN549 together. For students with prior learning, please appeal to HoP.", False), ("NIE351", "NIE201", "The pre-requisite of NIE201 only applies to students from Part-Time Honours & Full-Time Programmes.", True), ("ENG311", "ENG201 or ENG203", "Strongly suggested prerequisites: ENG201 and ENG203.", True), ("BME311", "BME102", "To take with BME312 in the same semester", True)]:
            with self.subTest(code=code):
                entry = source_entry(code, prerequisite)
                entry["remarks"] = remarks
                curriculum.attach_prerequisite_candidate(entry)
                self.assertEqual(entry["prerequisiteEvidenceText"], prerequisite + "\nRemarks: " + remarks)
                self.assertEqual(entry["prerequisiteSourceFields"], ["prerequisite", "remarks"])
                if parsed:
                    self.assertEqual(entry["parseStatus"], "parsed")
                    if code == "ENG311":
                        self.assertNotIn("displayRemarks", entry["parserRule"])
                    else:
                        self.assertEqual(entry["parserRule"]["displayRemarks"], [remarks])
                    self.assertNotIn("BME312", curriculum.prerequisite_rule_codes(entry["parserRule"]))
                else:
                    self.assertIsNone(entry["parserRule"])
                    self.assertEqual(entry["parseStatus"], "review_required")

    def test_remarks_only_recommendations_and_concurrent_pairs_never_become_completion_edges(self):
        for remarks in ["Students are to take ABC123 and DEF234 together in the first semester.", "Students must have completed the relevant undergraduate courses before taking ZZZ999", "To take after completing Levels 1 and 2 language courses."]:
            with self.subTest(remarks=remarks):
                entry = source_entry("ZZZ999", None)
                entry["remarks"] = remarks
                models = curriculum.build_product_models([PLAN], [entry], [])
                self.assertEqual(len(models["prerequisiteRules"]), 1)
                self.assertIsNone(entry["parserRule"])
                self.assertEqual(models["prerequisites"], [])
                self.assertEqual(entry["prerequisiteEvidenceText"], "Remarks: " + remarks)

    def test_psychology_routes_separate_passed_courses_from_concurrent_choices(self):
        for code, remarks, expected in [("PSY502", "To take PSY502, Forensic Psychology students must pass PSY501, and pass/concur rently take PSY521 and PSY522. Organisatio nal Psychology students must pass PSY501, and pass/concur rently take PSY512 and PSY515.", ["PSY501"]), ("PSY599", "To take PSY599, Forensic Psychology students must pass PSY502, PSY524 and PSY525, and pass/concur rently take PSY534 and PSY690 (or RSS501 and RSS503). Organisatio nal Psychology students must pass PSY502, PSY513 and PSY514, and pass/concur rently take PSY690 and an elective (or RSS501 and RSS503).", ["PSY502", "PSY524", "PSY525", "PSY513", "PSY514"])]:
            entry = source_entry(code, None)
            entry["remarks"] = remarks
            curriculum.attach_prerequisite_candidate(entry)
            self.assertEqual(entry["parseStatus"], "parsed")
            self.assertEqual(entry["parserRule"]["type"], "any")
            self.assertEqual(sorted(curriculum.prerequisite_rule_codes(entry["parserRule"])), sorted(expected))
            for route in entry["parserRule"]["children"]:
                self.assertTrue(any(node["type"] == "condition" and node["text"].startswith("Passed or concurrently") for node in route["children"]))
        entry = source_entry("PSY501", None)
        entry["remarks"] = "To take PSY501, Forensic Psychology students must pass/concurrently take PSY520 and PSY523. Organisational Psychology students must pass/concurrently take PSY511 and PSY516."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertIsNone(entry["parserRule"])

    def test_unrelated_remarks_are_scanned_without_becoming_prerequisites(self):
        for remarks in ["Labs will be conducted on weekends.", "On successful completion participants will be awarded a certificate.", "Weekly asynchronous lectures prior to each seminar.", "Final exam is an open book exam."]:
            entry = source_entry("ZZZ999", None)
            entry["remarks"] = remarks
            models = curriculum.build_product_models([PLAN], [entry], [])
            self.assertEqual(entry["prerequisiteSourceFields"], [])
            self.assertTrue(all(clause["disposition"] == "information" for clause in entry["prerequisiteRemarksAnalysis"]))
            self.assertEqual(models["prerequisiteRules"], [])
            self.assertNotIn("prerequisiteEvidenceText", entry)
        entry["remarks"] = "To take after ABC123 and DEF234. Students must pass GHI345 first."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertEqual(set(curriculum.prerequisite_rule_codes(entry["parserRule"])), {"ABC123", "DEF234", "GHI345"})
        entry["remarks"] = "To take after ABC123 and DEF234. Students must obtain prior approval before enrolling."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertIsNone(entry["parserRule"])
        entry["remarks"] = "Labs will be conducted on weekends."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertNotIn("prerequisiteEvidenceText", entry)

    def test_advice_awards_exclusions_and_requirements_of_other_courses_are_audited_separately(self):
        examples = [
            "Strongly recommend ed to complete ABC123 and DEF234 before taking this course.",
            "Suggested to be taken after ABC123.",
            "Can take with ABC123 in the same semester.",
            "Students must attend the SU6 lecture to be eligible for the issuance of the certificate.",
            "Must obtain a minimum GPA of 3.0 for credit recognition.",
            "New students must take ZZZ999 in their first semester.",
            "Students must register for ZZZ999 as part of their UCore requirement for graduation.",
            "Course will not be applicable for students who have completed ABC123 previously.",
            "Students who have completed ABC123 are not eligible to register for ZZZ999.",
            "ABC123 is a pre-requisite for DEF234.",
            "Exempted for students with a diploma.",
            "Enrolment preference will be given to final-year students.",
        ]
        for remarks in examples:
            with self.subTest(remarks=remarks):
                entry = source_entry("ZZZ999", None)
                entry["remarks"] = remarks
                models = curriculum.build_product_models([PLAN], [entry], [])
                self.assertEqual(entry["prerequisiteSourceFields"], [])
                self.assertNotIn("prerequisiteEvidenceText", entry)
                self.assertEqual(models["prerequisiteRules"], [])
                self.assertTrue(entry["prerequisiteRemarksAnalysis"])
                self.assertTrue(all(clause["reason"] for clause in entry["prerequisiteRemarksAnalysis"]))

    def test_required_clauses_survive_recommendations_and_delivery_notes_in_either_order(self):
        hard = "Students must have completed ABC123 and DEF234 before taking ZZZ999."
        advice = "Students are recommended to complete GHI345 first."
        for remarks in [hard + " " + advice, advice + " " + hard, "Labs are on weekends. " + hard + " ZZZ999 replaces JKL456."]:
            with self.subTest(remarks=remarks):
                entry = source_entry("ZZZ999", None)
                entry["remarks"] = remarks
                curriculum.attach_prerequisite_candidate(entry)
                self.assertEqual(entry["parseStatus"], "parsed")
                self.assertEqual(curriculum.prerequisite_rule_codes(entry["parserRule"]), ["ABC123", "DEF234"])
                self.assertEqual(entry["prerequisiteEvidenceText"], "Remarks: " + remarks)
                self.assertEqual(entry["prerequisiteNormalizedText"], hard)
                self.assertNotIn("displayRemarks", entry["parserRule"])

    def test_qualifications_are_retained_without_turning_advice_into_a_requirement(self):
        for hard in ["Students are required to have visual art qualifications.", "Students must have a degree in Psychology in order to take this course.", "Students must have access to work with children.", "Minimum Chinese Language Proficiency: GCE O level Chinese A2."]:
            entry = source_entry("ZZZ999", None)
            entry["remarks"] = hard + " Students are strongly advised to take ABC123."
            curriculum.attach_prerequisite_candidate(entry)
            self.assertEqual(entry["prerequisiteSourceFields"], ["remarks"])
            self.assertEqual(entry["prerequisiteNormalizedText"], hard)
            self.assertIsNone(entry["parserRule"])
        entry = source_entry("ZZZ999", "ABC123")
        entry["remarks"] = "Strongly suggested prerequisites: DEF234. ABC123 may be taken concurrently with this course."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertIsNone(entry["parserRule"])
        self.assertTrue(any("concurrently" in message for message in entry["prerequisiteDiagnostics"]))
        entry["remarks"] = "Labs are on weekends. The prerequisite only applies to full-time students. Suggested to take DEF234 first."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertEqual(entry["parserRule"]["displayRemarks"], ["The prerequisite only applies to full-time students."])
        self.assertEqual(curriculum.prerequisite_rule_codes(entry["parserRule"]), ["ABC123"])

    def test_unclear_preconditions_are_retained_for_triage_without_false_completion_edges(self):
        for remarks in ["Students should have completed ABC123 first.", "Knowledge of ABC123 is assumed.", "Students are advised to complete ABC123 but students must obtain prior approval."]:
            entry = source_entry("ZZZ999", None)
            entry["remarks"] = remarks
            curriculum.attach_prerequisite_candidate(entry)
            self.assertEqual(entry["prerequisiteSourceFields"], ["remarks"])
            self.assertIsNone(entry["parserRule"])
            self.assertEqual(entry["prerequisiteRemarksAnalysis"][0]["disposition"], "needs_review")

    def test_multi_sentence_completion_parser_preserves_scope_and_enforces_tree_budgets(self):
        groups = [" and ".join(f"ABC{n:03}" for n in range(100, 124)), " and ".join(f"DEF{n:03}" for n in range(100, 124))]
        for remarks in [
            "To take after ABC123. Students must pass ABC123 first.",
            "Full-time students: To take after ABC123. Part-time students: To take after DEF234.",
            "Full-time students: To take after ABC123. Students must pass DEF234 first.",
            " ".join(f"Students must pass {group} first." for group in groups),
        ]:
            with self.subTest(remarks=remarks):
                entry = source_entry("ZZZ999", None)
                entry["remarks"] = remarks
                models = curriculum.build_product_models([PLAN], [entry], [])
                self.assertIsNone(entry["parserRule"])
                self.assertEqual(models["prerequisites"], [])
                self.assertEqual(entry["prerequisiteEvidenceText"], "Remarks: " + remarks)

    def test_entry_tests_are_distinguished_from_programme_course_obligations(self):
        for remarks in ["To be eligible for ZZZ999, students must take the Placement Chinese Test.", "Students must take ABC123 in order to take ZZZ999."]:
            entry = source_entry("ZZZ999", None)
            entry["remarks"] = remarks
            curriculum.attach_prerequisite_candidate(entry)
            self.assertEqual(entry["prerequisiteSourceFields"], ["remarks"])
            self.assertEqual(entry["prerequisiteRemarksAnalysis"][0]["disposition"], "requirement")
            self.assertIsNone(entry["parserRule"])
        entry = source_entry("OGP281", "Placement Chinese Test or have taken OGP181. CET students are exempted from the Placement Test.")
        entry["remarks"] = "To be eligible for OGP281, students must take the Placement Chinese Test. CET students are exempted from the Placement Test."
        curriculum.attach_prerequisite_candidate(entry)
        self.assertTrue(all(c["disposition"] in {"requirement", "qualification"} for c in entry["prerequisiteRemarksAnalysis"]))
        self.assertIsNone(entry["parserRule"])

    def test_optional_pairing_with_another_course_does_not_qualify_existing_prerequisites(self):
        entry = source_entry("ICT340", "ICT162")
        entry["remarks"] = "Can be taken with ICT330 in the same semester"
        curriculum.attach_prerequisite_candidate(entry)
        self.assertEqual(entry["parserRule"], {"type": "course", "courseCode": "ICT162"})
        self.assertEqual(entry["prerequisiteRemarksAnalysis"][0]["disposition"], "information")
        entry["remarks"] = "Can be taken with ICT162 in the same semester"
        curriculum.attach_prerequisite_candidate(entry)
        self.assertIsNone(entry["parserRule"])

    def test_cohort_qualification_does_not_publish_an_unrestricted_or_tree(self):
        entry = source_entry("COU391", "COU291 or COU299")
        entry["remarks"] = "Individual session with supervisors. COU299 (Jan 2015 intake onwards)"
        curriculum.attach_prerequisite_candidate(entry)
        self.assertIsNone(entry["parserRule"])
        self.assertTrue(any("cohort or date" in message for message in entry["prerequisiteDiagnostics"]))
        self.assertIn(entry["remarks"], entry["prerequisiteEvidenceText"])

    def test_clinical_psychology_scope_and_all_four_required_courses_are_preserved(self):
        entry = source_entry("PSY690", "MPCL only: PSY531, PSY532, PSY533 and PSY534")
        curriculum.attach_prerequisite_candidate(entry)
        self.assertEqual(entry["parseStatus"], "parsed")
        self.assertEqual(entry["parserRule"]["type"], "all")
        self.assertIn({"type": "condition", "text": "MPCL only"}, entry["parserRule"]["children"])
        self.assertEqual(curriculum.prerequisite_rule_codes(entry["parserRule"]), ["PSY531", "PSY532", "PSY533", "PSY534"])

if __name__ == "__main__":
    unittest.main()
