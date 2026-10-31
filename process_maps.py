"""
Process raw historical map data into compact TopoJSON files and generate a manifest.json.

Data sources:
- GitHub historical basemaps (antiquity to 2010): maps/geojson/
- CShapes 2.0 (1886 to 2019): maps/CShapes-2.0.geojson

Routing logic:
- Years < 1886: strictly use maps/geojson/world_<year>.geojson (GitHub)
- Years >= 1886: prioritize maps/CShapes-2.0.geojson (filtered by July 1st of target year)
"""

import argparse
from datetime import date, datetime
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import topojson


# ---------------------------------------------------------------------------
# Configuration & Constants
# ---------------------------------------------------------------------------
DEFAULT_TEST_YEARS: List[int] = [
    1000,
    1492,
    1783,
    1815,
    1880,
    1914,
    1938,
    1945,
    1960,
    1991,
]

CSHAPES_THRESHOLD_YEAR: int = 1886
TARGET_MONTH: int = 7
TARGET_DAY: int = 1

DEFAULT_MAPS_DIR: Path = Path("maps")
DEFAULT_GEOJSON_DIR: Path = Path("maps/geojson")
DEFAULT_CSHAPES_FILE: Path = Path("maps/CShapes-2.0.geojson")
DEFAULT_OUTPUT_DIR: Path = Path("public/data")


# ---------------------------------------------------------------------------
# Date Extraction Helper for CShapes
# ---------------------------------------------------------------------------
def parse_feature_date(properties: Dict[str, Any], prefix: str) -> Optional[date]:
    """
    Extracts a date from CShapes properties.
    Supports:
    - Integer components: (gwsyear, gwsmonth, gwsday) / (gweyear, gwemonth, gweday)
    - Date strings: GWSTDATE, GWENDDATE, GWSDATE, GWEDATE, gwsdate, gwedate
    """
    props_lower = {k.lower(): v for k, v in properties.items()}

    # 1. Try explicit year/month/day integer fields
    y_keys = [f"{prefix}year", f"{prefix}tyear"]
    m_keys = [f"{prefix}month", f"{prefix}tmonth"]
    d_keys = [f"{prefix}day", f"{prefix}tday"]

    y = next((props_lower[k] for k in y_keys if k in props_lower and props_lower[k] is not None), None)
    m = next((props_lower[k] for k in m_keys if k in props_lower and props_lower[k] is not None), None)
    d = next((props_lower[k] for k in d_keys if k in props_lower and props_lower[k] is not None), None)

    if y is not None and m is not None and d is not None:
        try:
            return date(int(y), int(m), int(d))
        except (ValueError, TypeError):
            pass

    # 2. Try date string fields
    date_keys = [f"{prefix}tdate", f"{prefix}date"]
    for dk in date_keys:
        if dk in props_lower and props_lower[dk] is not None:
            val = str(props_lower[dk]).strip()
            for fmt in (
                "%d.%m.%Y %H:%M:%S",
                "%Y-%m-%d",
                "%Y/%m/%d",
                "%d.%m.%Y",
                "%Y-%m-%d %H:%M:%S",
            ):
                try:
                    return datetime.strptime(val, fmt).date()
                except ValueError:
                    pass

    return None


# ---------------------------------------------------------------------------
# Source Data Loaders
# ---------------------------------------------------------------------------
def load_github_map(year: int, geojson_dir: Path) -> Dict[str, Any]:
    """
    Loads the GeoJSON file corresponding to the specified year from the GitHub dataset.
    Looks for world_<year>.geojson or world_bc<year>.geojson for BC years.
    """
    if year < 0:
        filename = f"world_bc{abs(year)}.geojson"
    else:
        filename = f"world_{year}.geojson"

    file_path = geojson_dir / filename
    if not file_path.exists():
        # Search for available files to give helpful feedback
        available_files = [f.name for f in geojson_dir.glob("world_*.geojson")]
        raise FileNotFoundError(
            f"GitHub GeoJSON file '{filename}' not found in {geojson_dir}. "
            f"Available files count: {len(available_files)}"
        )

    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_cshapes_dataset(cshapes_path: Path) -> Dict[str, Any]:
    """Loads the complete CShapes 2.0 GeoJSON dataset into memory."""
    if not cshapes_path.exists():
        raise FileNotFoundError(f"CShapes dataset not found at {cshapes_path}")

    with open(cshapes_path, "r", encoding="utf-8") as f:
        return json.load(f)


def filter_cshapes_for_year(cshapes_data: Dict[str, Any], year: int) -> Dict[str, Any]:
    """
    Filters CShapes features valid on July 1st of the target year.
    Matches target date against GWSTDATE (gwsdate) and GWENDDATE (gwedate).
    """
    target_date = date(year, TARGET_MONTH, TARGET_DAY)
    matched_features: List[Dict[str, Any]] = []

    for feat in cshapes_data.get("features", []):
        props = feat.get("properties", {})
        start_date = parse_feature_date(props, "gws")
        end_date = parse_feature_date(props, "gwe")

        if start_date and end_date:
            if start_date <= target_date <= end_date:
                matched_features.append(feat)

    return {
        "type": "FeatureCollection",
        "features": matched_features,
    }


# ---------------------------------------------------------------------------
# TopoJSON Conversion & Export
# ---------------------------------------------------------------------------
def convert_to_topojson(
    geojson_data: Dict[str, Any],
    out_path: Path,
    object_name: str = "world",
    toposimplify: Optional[float] = None,
) -> int:
    """
    Converts GeoJSON FeatureCollection to compact TopoJSON and writes it to out_path.
    Returns the file size in bytes.
    """
    topo_args: Dict[str, Any] = {
        "data": geojson_data,
        "object_name": object_name,
        "prequantize": 1e5,
    }

    if toposimplify is not None and toposimplify > 0:
        topo_args["toposimplify"] = toposimplify

    topo = topojson.Topology(**topo_args)

    # pretty=False writes compact JSON without unnecessary whitespace
    topo.to_json(fp=str(out_path), pretty=False)
    return out_path.stat().st_size


# ---------------------------------------------------------------------------
# Main Processing Pipeline
# ---------------------------------------------------------------------------
def process_rounds(
    years: List[int],
    geojson_dir: Path = DEFAULT_GEOJSON_DIR,
    cshapes_path: Path = DEFAULT_CSHAPES_FILE,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    toposimplify: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Processes the specified years according to the routing rules:
    - Year < 1886: GitHub dataset
    - Year >= 1886: CShapes dataset (prioritized)
    Generates TopoJSON files and returns the manifest rounds list.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Preload CShapes if any year requires it
    needs_cshapes = any(y >= CSHAPES_THRESHOLD_YEAR for y in years)
    cshapes_data: Optional[Dict[str, Any]] = None
    if needs_cshapes:
        print(f"Loading CShapes dataset from {cshapes_path}...")
        cshapes_data = load_cshapes_dataset(cshapes_path)
        print(f"Loaded CShapes ({len(cshapes_data.get('features', []))} total features).")

    manifest_rounds: List[Dict[str, Any]] = []

    print("\n--- Starting Data Processing ---")
    for idx, year in enumerate(years, start=1):
        target_date_str = f"{year:04d}-{TARGET_MONTH:02d}-{TARGET_DAY:02d}"
        source_name: str = ""
        geojson_to_convert: Optional[Dict[str, Any]] = None

        if year < CSHAPES_THRESHOLD_YEAR:
            # Strictly use GitHub data
            source_name = "GitHub"
            print(f"[{idx}/{len(years)}] Year {year} (< {CSHAPES_THRESHOLD_YEAR}): using GitHub dataset...")
            geojson_to_convert = load_github_map(year, geojson_dir)
        else:
            # Prioritize CShapes dataset
            source_name = "CShapes"
            print(f"[{idx}/{len(years)}] Year {year} (>= {CSHAPES_THRESHOLD_YEAR}): prioritizing CShapes dataset...")
            if cshapes_data:
                filtered_cshapes = filter_cshapes_for_year(cshapes_data, year)
                if filtered_cshapes["features"]:
                    geojson_to_convert = filtered_cshapes
                else:
                    print(f"  Warning: No CShapes features found for {year}, checking GitHub fallback...")
                    geojson_to_convert = load_github_map(year, geojson_dir)
                    source_name = "GitHub"
            else:
                geojson_to_convert = load_github_map(year, geojson_dir)
                source_name = "GitHub"

        feature_count = len(geojson_to_convert.get("features", []))
        out_filename = f"world_{year}.topojson"
        out_path = output_dir / out_filename

        file_size_bytes = convert_to_topojson(
            geojson_data=geojson_to_convert,
            out_path=out_path,
            object_name="world",
            toposimplify=toposimplify,
        )

        size_kb = file_size_bytes / 1024
        print(
            f"  -> Generated {out_filename} ({feature_count} features, "
            f"{size_kb:.1f} KB) via {source_name}"
        )

        manifest_rounds.append(
            {
                "id": idx,
                "year": year,
                "target_year": year,
                "target_date": target_date_str,
                "file": out_filename,
                "path": str(out_path.as_posix()),
                "source": source_name,
                "feature_count": feature_count,
            }
        )

    # Write manifest.json
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_rounds, f, indent=2, ensure_ascii=False)

    print(f"\nManifest successfully written to: {manifest_path}")
    print(f"Total rounds processed: {len(manifest_rounds)}")
    return manifest_rounds


# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Process historical map data into compact TopoJSON and create manifest.json."
    )
    parser.add_argument(
        "--years",
        type=str,
        default=",".join(map(str, DEFAULT_TEST_YEARS)),
        help=f"Comma-separated list of target years (default: {','.join(map(str, DEFAULT_TEST_YEARS))})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory for TopoJSON and manifest (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--simplify",
        type=float,
        default=None,
        help="Optional Douglas-Peucker simplification tolerance (in degrees, e.g. 0.01)",
    )

    args = parser.parse_args()
    parsed_years = [int(y.strip()) for y in args.years.split(",") if y.strip()]

    process_rounds(
        years=parsed_years,
        output_dir=args.output_dir,
        toposimplify=args.simplify,
    )


if __name__ == "__main__":
    main()

