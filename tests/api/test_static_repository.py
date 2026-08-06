from __future__ import annotations

from pathlib import Path
import unittest

from apps.api.app.static_repository import StaticPrecomputedRepository


ROOT = Path(__file__).resolve().parents[2]


class StaticRepositoryTests(unittest.TestCase):
    def test_manifest_checksums_and_indexed_responses_load(self) -> None:
        repository = StaticPrecomputedRepository(ROOT / "contracts" / "examples" / "precomputed")
        regions = repository.list_regions("district", None)
        self.assertEqual({region["id"] for region in regions}, {
            "district:nagpur",
            "district:bengaluru-urban",
            "district:mumbai-city",
            "district:mumbai",
            "district:delhi",
            "district:chennai",
            "district:bhopal",
            "district:new-york",
            "district:washington-dc",
            "district:tokyo",
            "district:london",
            "district:cairo",
            "district:sydney",
            "district:rio-de-janeiro",
            "district:reykjavik",
        })
        built = repository.get_indicator("district:nagpur", "built-up")
        assert built is not None
        self.assertEqual(built["data"]["status"], "complete")
        self.assertAlmostEqual(built["data"]["metric"]["absoluteChange"], 158.4709068373673)
        mumbai = repository.get_indicator("district:mumbai-city", "built-up")
        assert mumbai is not None
        self.assertEqual(mumbai["data"]["status"], "complete")
        self.assertIsNotNone(mumbai["data"]["metric"]["absoluteChange"])
        global_mumbai = repository.get_indicator("district:mumbai", "surface-water")
        assert global_mumbai is not None
        self.assertEqual(global_mumbai["data"]["status"], "complete")


if __name__ == "__main__":
    unittest.main()
