"""
content.py -- lesson loading and progress persistence.

Lessons are plain JSON files in the `lessons/` directory, loaded in filename
order (lesson_01_*.json, lesson_02_*.json, ...). Keeping lessons as data (not
code) means you can add new ones without touching the engine.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Lesson model
# ---------------------------------------------------------------------------

@dataclass
class Lesson:
    id: str
    title: str
    concept: str
    task: str
    starter: str
    checks: list[dict]
    solution: str
    ab_note: str = ""
    siemens_note: str = ""
    sources: list[str] = field(default_factory=list)
    slug: str = ""  # filename stem, used for the per-lesson workspace file
    viz: dict | None = None  # optional visualization spec (e.g. hysteresis)

    @classmethod
    def from_file(cls, path: Path) -> "Lesson":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            id=data["id"],
            title=data["title"],
            concept=data["concept"],
            task=data["task"],
            starter=data.get("starter", ""),
            checks=data["checks"],
            solution=data.get("solution", ""),
            ab_note=data.get("ab_note", ""),
            siemens_note=data.get("siemens_note", ""),
            sources=data.get("sources", []),
            slug=path.stem,
            viz=data.get("viz"),
        )


def load_lessons(lessons_dir: Path) -> list[Lesson]:
    files = sorted(lessons_dir.glob("lesson_*.json"))
    if not files:
        raise FileNotFoundError(f"No lessons found in {lessons_dir}")
    return [Lesson.from_file(f) for f in files]


# ---------------------------------------------------------------------------
# Progress persistence
# ---------------------------------------------------------------------------

class Progress:
    """Tracks which lessons are completed. Persisted as JSON next to the game."""

    def __init__(self, path: Path):
        self.path = path
        self.completed: set[str] = set()
        self.intro_seen: bool = False
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                self.completed = set(data.get("completed", []))
                self.intro_seen = bool(data.get("intro_seen", False))
            except (json.JSONDecodeError, OSError):
                self.completed = set()

    def save(self) -> None:
        self.path.write_text(
            json.dumps({"completed": sorted(self.completed),
                        "intro_seen": self.intro_seen}, indent=2),
            encoding="utf-8",
        )

    def mark(self, lesson_id: str) -> None:
        self.completed.add(lesson_id)
        self.save()

    def mark_intro(self) -> None:
        self.intro_seen = True
        self.save()

    def is_done(self, lesson_id: str) -> bool:
        return lesson_id in self.completed

    def reset(self) -> None:
        self.completed.clear()
        self.save()
