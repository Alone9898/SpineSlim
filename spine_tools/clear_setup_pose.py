from typing import Any

from .models import TransformResult


def clear_setup_pose(data: dict[str, Any]) -> TransformResult:
    setup_slots = [slot for slot in data.get("slots", []) if "attachment" in slot]
    if setup_slots and not data.get("animations"):
        raise ValueError("cannot migrate setup attachments: no animations")

    setup_attachment_count = 0
    created_timeline_count = 0
    prepended_frame_count = 0
    preserved_time_zero_frame_count = 0

    for slot in data.get("slots", []):
        if "attachment" not in slot:
            continue

        setup_attachment_count += 1
        slot_name = slot["name"]
        attachment_name = slot["attachment"]
        for animation in data.get("animations", {}).values():
            slots = animation.setdefault("slots", {})
            slot_timeline = slots.setdefault(slot_name, {})
            if "attachment" not in slot_timeline:
                slot_timeline["attachment"] = [
                    {"time": 0, "name": attachment_name}
                ]
                created_timeline_count += 1
                continue

            attachment_timeline = slot_timeline["attachment"]
            if not attachment_timeline:
                attachment_timeline.append({"time": 0, "name": attachment_name})
            elif attachment_timeline[0].get("time", 0) > 0:
                attachment_timeline.insert(0, {"time": 0, "name": attachment_name})
                prepended_frame_count += 1
            elif attachment_timeline[0].get("time", 0) == 0:
                preserved_time_zero_frame_count += 1

        del slot["attachment"]

    return TransformResult(
        data=data,
        setup_attachment_count=setup_attachment_count,
        created_timeline_count=created_timeline_count,
        prepended_frame_count=prepended_frame_count,
        preserved_time_zero_frame_count=preserved_time_zero_frame_count,
    )
