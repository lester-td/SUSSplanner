import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import parse_curriculum_plans as curriculum


FIXTURES = json.loads((Path(__file__).parent / "fixtures/curriculum_prerequisites.json").read_text(encoding="utf-8"))


def condition_nodes(rule):
    if rule["type"] == "condition":
        return [rule]
    return [node for child in rule.get("children", []) for node in condition_nodes(child)]


def source_entry(fixture):
    return {
        "planKey": "fixture-plan",
        "courseCode": fixture["courseCode"],
        "courseTitle": "Fixture course",
        "recordType": "offering",
        "section": "Compulsory - 20 cu",
        "prerequisite": fixture["prerequisite"],
        "sourcePage": fixture.get("sourcePage", 1),
    }


PLAN = {
    "planKey": "fixture-plan", "programmeName": "Fixture programme",
    "category": "undergraduate", "studyMode": "full-time",
    "sourcePath": "fixture.pdf", "sourceHash": "fixture-hash", "courseLikeRowCount": 4,
}


class CurriculumPrerequisiteTests(unittest.TestCase):
    def test_corpus_conditions_are_retained_for_review(self):
        for fixture in FIXTURES:
            with self.subTest(course=fixture["courseCode"]):
                codes = curriculum.course_codes(fixture["prerequisite"])
                self.assertEqual(codes, fixture["courseCodes"])
                _, status, rule = curriculum.prerequisite_rule(fixture["prerequisite"], codes)
                self.assertEqual(status, "review_required")
                conditions = condition_nodes(rule)
                self.assertEqual(len(conditions), 1)
                self.assertEqual(conditions[0]["conditionTypes"], fixture["conditionTypes"])
                self.assertEqual(conditions[0]["sourceText"], fixture["prerequisite"])
                for fragment in fixture["residualIncludes"]:
                    self.assertIn(fragment, conditions[0]["text"])

    def test_common_and_unknown_conditions_cannot_be_fully_parsed(self):
        cases = [
            ("ACC201 and two years of relevant work experience", "experience", "two years"),
            ("ACC201 or prior learning in finance", "prior_learning", "prior learning"),
            ("ACC201 and at least 50.5 credit units", "credit_units", "50.5 credit units"),
            ("ACC201 and senior programme standing", "programme_standing", "programme standing"),
            ("ACC201 with concurrent enrollment in BUS101", "co_enrollment", "concurrent enrollment"),
            ("ACC201 and co-enrolment in BUS101", "co_enrollment", "co-enrolment"),
            ("ACC201 and co-enrollment in BUS101", "co_enrollment", "co-enrollment"),
            ("Co-enrol in ACC201 and BUS101", "co_enrollment", "Co-enrol"),
            ("ACC201 and departmental approval", "unrecognized", "departmental approval"),
            ("ACC201 with a minimum grade of B", "unrecognized", "minimum grade"),
            ("ACC201 or BUS101 and a placement test", "placement_test", "placement test"),
        ]
        for text, kind, fragment in cases:
            with self.subTest(text=text):
                _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertEqual(status, "review_required")
                conditions = condition_nodes(rule)
                self.assertEqual(len(conditions), 1)
                self.assertIn(kind, conditions[0]["conditionTypes"])
                self.assertIn(fragment, conditions[0]["text"])
                self.assertEqual(conditions[0]["sourceText"], text)

    def test_conditions_without_course_codes_are_preserved(self):
        for text in ["20cu (Major)", "Placement test or two years of experience", "Departmental approval"]:
            with self.subTest(text=text):
                operator, status, rule = curriculum.prerequisite_rule(text, [])
                self.assertEqual(operator, "condition")
                self.assertEqual(status, "review_required")
                self.assertEqual(rule["text"], text)
                self.assertEqual(rule["sourceText"], text)

    def test_ece_co_enrollment_never_creates_prerequisite_edges(self):
        fixture = next(item for item in FIXTURES if item["courseCode"] == "ECE490")
        for code in ["ECE490", "ECE499", "ece490", "ece499"]:
            with self.subTest(course=code):
                entry = source_entry({**fixture, "courseCode": code})
                issues = []
                models = curriculum.build_product_models([PLAN], [entry], issues)
                rule = models["prerequisiteRules"][0]
                self.assertEqual(rule["parseStatus"], "review_required")
                self.assertEqual(rule["operator"], "condition")
                self.assertEqual(curriculum.prerequisite_rule_codes(rule["rule"]), [])
                self.assertEqual(models["prerequisites"], [])
                self.assertEqual(rule["rule"]["text"], fixture["prerequisite"])
                self.assertIn("co_enrollment", rule["rule"]["conditionTypes"])
                self.assertEqual(len(issues), 1)
                self.assertIn("Self-reference", issues[0]["issue"])
                self.assertIn("review_required", issues[0]["issue"])
                self.assertIn("co_enrollment", issues[0]["issue"])
                self.assertEqual(issues[0]["sourcePage"], fixture["sourcePage"])
                sql = curriculum.generate_sql(models)
                self.assertNotIn("INSERT INTO curriculum_prerequisites", sql)
                self.assertIn(fixture["prerequisite"], sql)
                with tempfile.TemporaryDirectory() as directory:
                    report = Path(directory) / "issues.tsv"
                    curriculum.write_issues(report, issues)
                    self.assertIn(f"fixture-plan\t{code}\t3\twarning\tSelf-reference", report.read_text())

    def test_self_references_are_removed_but_real_prerequisites_remain(self):
        for code, text, expected in [
            ("ECE490", "ECE490", []),
            ("ECE490", "ece490 and ACC201", ["ACC201"]),
            ("ece490", "ECE490 and ACC201", ["ACC201"]),
            ("HB C105", "HBC105 and ACC201", ["ACC201"]),
            ("bus557ae", "BUS557Ae and ACC201", ["ACC201"]),
        ]:
            with self.subTest(course=code, text=text):
                issues = []
                models = curriculum.build_product_models([PLAN], [source_entry({
                    "courseCode": code, "prerequisite": text,
                })], issues)
                rule = models["prerequisiteRules"][0]
                self.assertEqual(rule["parseStatus"], "review_required")
                self.assertEqual(curriculum.prerequisite_rule_codes(rule["rule"]), expected)
                self.assertEqual([edge["prerequisiteCourseCode"] for edge in models["prerequisites"]], expected)
                self.assertEqual(rule["rawText"], text)
                self.assertIn("Self-reference", issues[0]["issue"])
                curriculum.generate_sql(models)

    def test_co_enrollment_without_self_reference_preserves_the_whole_passage(self):
        for text in ["Co-enrol in ACC201 and BUS101",
                     "ACC201 with concurrent enrollment in BUS101",
                     "Complete ACC201 and take BUS101 at the same time"]:
            with self.subTest(text=text):
                issues = []
                models = curriculum.build_product_models([PLAN], [source_entry({
                    "courseCode": "ECE490", "prerequisite": text,
                })], issues)
                self.assertEqual(models["prerequisites"], [])
                rule = models["prerequisiteRules"][0]
                self.assertEqual(rule["rule"]["text"], text)
                self.assertEqual(rule["parseStatus"], "review_required")
                self.assertIn("co_enrollment", issues[0]["issue"])

    def test_sql_generation_rejects_self_edges_and_nested_course_nodes(self):
        entry = source_entry({"courseCode": "ECE499", "prerequisite": "ECE490"})
        issues = []
        models = curriculum.build_product_models([PLAN], [entry], issues)
        self.assertEqual(models["prerequisiteRules"][0]["parseStatus"], "parsed")
        self.assertEqual(models["prerequisites"][0]["prerequisiteCourseCode"], "ECE490")
        self.assertEqual(issues, [])
        curriculum.generate_sql(models)
        models["prerequisites"][0]["prerequisiteCourseCode"] = " ece499 "
        with self.assertRaisesRegex(ValueError, "Self-prerequisite"):
            curriculum.generate_sql(models)
        models["prerequisites"][0]["prerequisiteCourseCode"] = "ECE490"
        models["prerequisiteRules"][0]["rule"]["children"].append({
            "type": "any", "children": [{"type": "course", "courseCode": "ece499"}],
        })
        with self.assertRaisesRegex(ValueError, "Self-prerequisite"):
            curriculum.generate_sql(models)

    def test_course_only_rules_remain_parsed(self):
        cases = [
            ("ACC201", "single"),
            ("ACC201 and BUS101", "all"),
            ("ACC201 & BUS101", "all"),
            ("ACC201, BUS101, FIN101", "all"),
            ("ACC201 or BUS101", "any"),
            ("(ACC201 or BUS101).", "any"),
            ("Successful completion of ACC201 or BUS101", "any"),
            ("Students must have completed ACC201", "single"),
            ("Have taken ACC201", "single"),
            ("HB C105", "single"),
            ("BUS557Ae", "single"),
        ]
        for text, expected_operator in cases:
            with self.subTest(text=text):
                operator, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertEqual(operator, expected_operator)
                self.assertEqual(status, "parsed")
                self.assertEqual(condition_nodes(rule), [])

    def test_mixed_course_logic_and_unknown_syntax_require_review(self):
        text = "ACC201 or (BUS101 and FIN101)"
        operator, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
        self.assertEqual((operator, status), ("mixed", "review_required"))
        self.assertEqual(rule["type"], "unparsed")
        self.assertEqual(rule["text"], text)
        self.assertEqual(condition_nodes(rule), [])
        for text in ["ACC201/BUS101", "ACC201 + BUS101", "Not ACC201"]:
            with self.subTest(text=text):
                _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertEqual(status, "review_required")
                self.assertTrue(condition_nodes(rule))

    def test_incomplete_course_expressions_cannot_be_fully_parsed(self):
        for text in ["ACC201 or", "and ACC201", "ACC201 or or BUS101",
                     "(ACC201 and BUS101", "ACC201 ()", "ACC201 BUS101",
                     "ACC201, BUS101 or FIN101"]:
            with self.subTest(text=text):
                _, status, rule = curriculum.prerequisite_rule(text, curriculum.course_codes(text))
                self.assertEqual(status, "review_required")
                self.assertEqual(rule["type"], "unparsed")
                self.assertEqual(rule["text"], text)

    def test_models_sql_and_issue_report_preserve_conditions_and_source_coordinates(self):
        entries = [source_entry(fixture) for fixture in FIXTURES]
        issues = []
        models = curriculum.build_product_models([PLAN], entries, issues)
        self.assertEqual(len(issues), len(FIXTURES))
        for fixture, rule, issue in zip(FIXTURES, models["prerequisiteRules"], issues):
            self.assertEqual(rule["rawText"], fixture["prerequisite"])
            self.assertEqual(rule["parseStatus"], "review_required")
            self.assertEqual(issue["planKey"], PLAN["planKey"])
            self.assertEqual(issue["courseCode"], fixture["courseCode"])
            self.assertEqual(issue["sourcePage"], fixture["sourcePage"])
            self.assertEqual(issue["severity"], "warning")
            for kind in fixture["conditionTypes"]:
                self.assertIn(kind, issue["issue"])
            for fragment in fixture["residualIncludes"]:
                self.assertIn(fragment, issue["issue"])
        self.assertEqual(entries, [source_entry(fixture) for fixture in FIXTURES])
        sql = curriculum.generate_sql(models)
        for fixture in FIXTURES:
            self.assertIn(fixture["prerequisite"], sql)
        self.assertIn("'review_required'", sql)
        self.assertIn('"type": "condition"', sql)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "issues.tsv"
            curriculum.write_issues(path, issues)
            report = path.read_text(encoding="utf-8")
            for fixture in FIXTURES:
                self.assertIn(f"fixture-plan\t{fixture['courseCode']}\t{fixture['sourcePage']}\twarning", report)

    def test_main_includes_prerequisite_issues_in_json_and_tsv(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "input").mkdir()
            (root / "input/fixture.pdf").touch()
            argv = ["parse_curriculum_plans.py", "--input-dir", str(root / "input"),
                    "--json", str(root / "curriculum.json"), "--out", str(root / "curriculum.sql"),
                    "--issues-out", str(root / "issues.tsv")]
            entries = [source_entry(fixture) for fixture in FIXTURES]
            with patch("sys.argv", argv), patch.object(curriculum, "parse_plan", return_value=(PLAN, entries, [])):
                curriculum.main()
            payload = json.loads((root / "curriculum.json").read_text(encoding="utf-8"))
            self.assertEqual(payload["metadata"]["issueCount"], len(FIXTURES))
            self.assertEqual(len(payload["review"]["issues"]), len(FIXTURES))
            self.assertTrue(all(rule["parseStatus"] == "review_required" for rule in payload["prerequisiteRules"]))
            ece_rule = next(rule for rule in payload["prerequisiteRules"] if rule["courseCode"] == "ECE490")
            self.assertEqual(ece_rule["rule"]["type"], "condition")
            self.assertFalse(any(edge["ruleKey"] == ece_rule["ruleKey"] for edge in payload["prerequisites"]))
            self.assertIn("Self-reference to ECE490", (root / "issues.tsv").read_text(encoding="utf-8"))
            self.assertIn("prior_learning", (root / "issues.tsv").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
