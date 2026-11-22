import json
import os
import sys


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python build_source_index.py <source_dir>")

    source_dir = sys.argv[1]
    os.makedirs(source_dir, exist_ok=True)

    metadata = {
        "status": "ready",
        "stage": "index-complete",
    }

    with open(os.path.join(source_dir, "metadata.json"), "w", encoding="utf-8") as file:
        json.dump(metadata, file, ensure_ascii=True, indent=2)

    print("Index build placeholder completed")


if __name__ == "__main__":
    main()
