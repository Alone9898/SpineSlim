from typing import Any

from .models import ValidationResult


def validate_spine_json(data: Any) -> ValidationResult:
    if not isinstance(data, dict):
        return ValidationResult(success=False, errors=["root_not_object"])

    required = ("skeleton", "bones", "slots", "skins", "animations")
    errors = [f"missing_{name}" for name in required if name not in data]

    animations = data.get("animations", {})
    if isinstance(animations, dict):
        for animation_name, animation in animations.items():
            if not isinstance(animation, dict):
                continue
            slots = animation.get("slots", {})
            if not isinstance(slots, dict):
                continue
            for slot_name, slot_timelines in slots.items():
                if not isinstance(slot_timelines, dict):
                    continue
                frames = slot_timelines.get("attachment", [])
                if not isinstance(frames, list):
                    continue
                if any(
                    isinstance(frame, dict) and frame.get("time", 0) < 0
                    for frame in frames
                ):
                    errors.append(
                        f"negative_attachment_time:{animation_name}:{slot_name}"
                    )

    return ValidationResult(success=not errors, errors=errors)
