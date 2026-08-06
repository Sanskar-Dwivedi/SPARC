"""Server-only configuration with conservative local defaults."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    repo_root: Path
    examples_root: Path
    forecast_examples_root: Path
    precomputed_examples_root: Path
    precomputed_root: Path
    earth_engine_reports_root: Path
    boundary_metadata_path: Path
    data_mode: str
    use_precomputed: bool
    allowed_origins: tuple[str, ...]
    max_request_bytes: int
    comparison_requests_per_minute: int

    @classmethod
    def from_environment(cls) -> "Settings":
        repo_root = Path(__file__).resolve().parents[3]
        requested_mode = os.getenv("SPARC_DATA_MODE", "demo").strip().lower()
        if requested_mode not in {"demo", "precomputed"}:
            raise RuntimeError("SPARC_DATA_MODE must be demo or precomputed")
        use_precomputed = requested_mode == "precomputed"
        data_mode = "cache" if use_precomputed else "demo"

        origins_value = os.getenv(
            "SPARC_ALLOWED_ORIGINS",
            "http://localhost:5173,http://localhost:8123",
        )
        origins_list = [origin.strip() for origin in origins_value.split(",") if origin.strip()]
        # Vercel supplies the deployment hostname to serverless functions.
        # Include it without weakening the explicit-origin rule so same-origin
        # browser requests work while wildcard CORS remains impossible.
        vercel_url = os.getenv("VERCEL_URL", "").strip()
        if vercel_url:
            deployment_origin = vercel_url if "://" in vercel_url else f"https://{vercel_url}"
            if deployment_origin not in origins_list:
                origins_list.append(deployment_origin)
        origins = tuple(origins_list)
        if not origins or "*" in origins:
            raise RuntimeError("SPARC_ALLOWED_ORIGINS must contain explicit origins")

        # Reporting accepts at most 20 MiB of user attachments plus bounded
        # metadata; the report generator enforces the tighter per-file and
        # combined limits.  Keep this as a hard upper bound for chunked bodies.
        max_request_bytes = _bounded_int(
            "SPARC_MAX_REQUEST_BYTES", 25 * 1024 * 1024, 1_024, 25 * 1024 * 1024
        )
        requests_per_minute = _bounded_int(
            "SPARC_COMPARISON_REQUESTS_PER_MINUTE", 60, 1, 10_000
        )
        return cls(
            repo_root=repo_root,
            examples_root=repo_root / "contracts" / "examples",
            forecast_examples_root=repo_root / "contracts" / "examples" / "forecasts",
            precomputed_examples_root=repo_root / "contracts" / "examples" / "precomputed",
            precomputed_root=repo_root / "data" / "processed" / "prepublication-packs",
            earth_engine_reports_root=repo_root / "data" / "processed" / "earth-engine-p0",
            boundary_metadata_path=(
                repo_root
                / "data"
                / "metadata"
                / "boundaries"
                / "geoBoundaries-IND-ADM2-76128533"
                / "release-metadata.json"
            ),
            data_mode=data_mode,
            use_precomputed=use_precomputed,
            allowed_origins=origins,
            max_request_bytes=max_request_bytes,
            comparison_requests_per_minute=requests_per_minute,
        )


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value
