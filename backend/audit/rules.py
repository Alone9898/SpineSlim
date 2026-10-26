import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from spine_tools.validator import validate_spine_json

from .atlas import parse_atlas_pages
from .scanner import Cancelled

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
HASH_CHUNK = 1024 * 1024
SPECIAL_NAME = re.compile(r"[\s#%&+]")


@dataclass
class Issue:
    rule_id: str
    code: str
    severity: str
    title: str
    description: str
    files: list
    evidence: list
    suggestion: str

    def to_report(self):
        return {
            "ruleId": self.rule_id,
            "code": self.code,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "files": self.files,
            "evidence": self.evidence,
            "suggestion": self.suggestion,
        }


@dataclass
class RuleContext:
    root: Path
    entries: list
    options: dict
    cancelled: object
    unchecked: list = field(default_factory=list)

    def check_cancelled(self):
        if self.cancelled.is_set():
            raise Cancelled()


@dataclass(frozen=True)
class Rule:
    rule_id: str
    version: str
    run: object
    coverage: str


RULES = []


def rule(rule_id, version, coverage):
    def register(function):
        RULES.append(Rule(rule_id, version, function, coverage))
        return function
    return register


def file_hash(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(HASH_CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


@rule("R01", "1", "Exact duplicates: all files, confirmed by SHA-256 after size match")
def exact_duplicates(context):
    by_size = defaultdict(list)
    for entry in context.entries:
        by_size[entry.size].append(entry)
    issues = []
    for size, group in by_size.items():
        if len(group) < 2 or size == 0:
            continue
        by_hash = defaultdict(list)
        for entry in group:
            context.check_cancelled()
            by_hash[file_hash(entry.path)].append(entry)
        for same in by_hash.values():
            if len(same) < 2:
                continue
            files = [entry.relative for entry in same]
            issues.append(Issue(
                rule_id="R01",
                code="duplicate_files",
                severity="warning",
                title="Exact duplicate files",
                description="Files have identical content (SHA-256 match).",
                files=files,
                evidence=[f"sha256 match, {len(same)} files, {size} bytes each"],
                suggestion="Keep one copy and update references; check references before deleting.",
            ))
    return issues


@rule("R04", "1", "Missing atlas page images (Spine .atlas files only)")
def missing_atlas_pages(context):
    known = {entry.relative for entry in context.entries}
    issues = []
    for entry in context.entries:
        if entry.extension != ".atlas":
            continue
        context.check_cancelled()
        text = entry.path.read_text(encoding="utf-8", errors="replace")
        folder = Path(entry.relative).parent
        for page in parse_atlas_pages(text):
            target = (folder / page.replace("\\", "/")).as_posix() if folder.as_posix() != "." else page.replace("\\", "/")
            if target not in known:
                issues.append(Issue(
                    rule_id="R04",
                    code="atlas_missing_page",
                    severity="critical",
                    title="Atlas references missing texture",
                    description="The atlas page image is not present in the scanned directory.",
                    files=[entry.relative],
                    evidence=[f"missing page: {page}"],
                    suggestion="Restore the texture or re-export the atlas.",
                ))
    return issues


@rule("R10", "1", "BMFont XML/text page images (.fnt)")
def missing_bmfont_pages(context):
    known = {entry.relative for entry in context.entries}
    issues = []
    for entry in context.entries:
        if entry.extension != ".fnt":
            continue
        context.check_cancelled()
        try:
            content = entry.path.read_text(encoding="utf-8-sig")
            if content.lstrip().startswith("<"):
                pages = [node.attrib["file"] for node in ET.fromstring(content).iter("page") if "file" in node.attrib]
            else:
                pages = re.findall(r'^page\s+[^\r\n]*?\bfile="([^"]+)"', content, re.MULTILINE)
        except (OSError, ValueError, ET.ParseError):
            context.unchecked.append((entry.relative, "fnt_unreadable"))
            continue
        folder = Path(entry.relative).parent
        for page in pages:
            target = (folder / page.replace("\\", "/")).as_posix()
            if target not in known:
                issues.append(Issue("R10", "bmfont_missing_page", "critical", "BMFont page is missing",
                                    "The font references an unavailable page image.", [entry.relative],
                                    [f"missing page: {page}"], "Restore the page image or re-export the font."))
    return issues


@rule("R11", "1", "External GLTF buffers and images (.gltf)")
def missing_gltf_dependencies(context):
    known = {entry.relative for entry in context.entries}
    issues = []
    for entry in context.entries:
        if entry.extension != ".gltf":
            continue
        context.check_cancelled()
        try:
            data = json.loads(entry.path.read_text(encoding="utf-8-sig"))
            references = [item.get("uri") for kind in ("buffers", "images") for item in data.get(kind, [])]
        except (OSError, ValueError, TypeError, AttributeError):
            context.unchecked.append((entry.relative, "gltf_unreadable"))
            continue
        folder = Path(entry.relative).parent
        for uri in references:
            if not isinstance(uri, str) or uri.startswith("data:"):
                continue
            if "://" in uri or uri.startswith("/"):
                context.unchecked.append((entry.relative, "gltf_external_uri"))
                continue
            from urllib.parse import unquote, urlsplit
            path = unquote(urlsplit(uri).path).replace("\\", "/")
            target = (folder / path).as_posix()
            if target not in known:
                issues.append(Issue("R11", "gltf_missing_dependency", "critical", "GLTF dependency is missing",
                                    "The model references an unavailable buffer or texture.", [entry.relative],
                                    [f"missing dependency: {path}"], "Restore the file beside the model or update its URI."))
    return issues


@rule("R05", "1", "Image dimensions over threshold (PNG, JPG, WebP)")
def oversized_images(context):
    limit = int(context.options.get("max_image_edge", 4096))
    issues = []
    for entry in context.entries:
        if entry.extension not in IMAGE_EXTENSIONS:
            continue
        context.check_cancelled()
        try:
            with Image.open(entry.path) as image:
                width, height = image.size
        except OSError:
            context.unchecked.append((entry.relative, "image_unreadable"))
            continue
        if max(width, height) > limit:
            issues.append(Issue(
                rule_id="R05",
                code="image_oversized",
                severity="suggestion",
                title="Image exceeds size threshold",
                description="Image is larger than the configured edge limit. This is an optimization hint, not an error.",
                files=[entry.relative],
                evidence=[f"{width}x{height}, limit {limit}"],
                suggestion="Check whether the display size needs this resolution.",
            ))
    return issues


@rule("R06", "1", "Excess transparent padding (PNG, WebP with alpha)")
def transparent_padding(context):
    threshold = float(context.options.get("max_transparent_fraction", 0.75))
    issues = []
    for entry in context.entries:
        if entry.extension not in (".png", ".webp"):
            continue
        context.check_cancelled()
        try:
            with Image.open(entry.path) as image:
                if "A" not in image.getbands() and "transparency" not in image.info:
                    continue
                width, height = image.size
                if width * height > 4096 * 4096:
                    context.unchecked.append((entry.relative, "alpha_analysis_too_large"))
                    continue
                bounds = image.convert("RGBA").getchannel("A").getbbox()
        except (OSError, ValueError):
            continue
        if bounds is None:
            continue
        fraction = 1 - (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) / (width * height)
        if fraction > threshold:
            issues.append(Issue("R06", "transparent_padding", "suggestion", "Large transparent padding",
                                "Most pixels lie outside the visible alpha bounds.", [entry.relative],
                                [f"transparent area outside bounds: {fraction:.0%}, threshold {threshold:.0%}"],
                                "Check whether trimming is appropriate; Spine atlas coordinates may depend on the canvas size."))
    return issues


@rule("R07", "1", "File size over threshold (all files)")
def oversized_files(context):
    limit = int(context.options.get("max_file_bytes", 20 * 1024 * 1024))
    issues = []
    for entry in context.entries:
        if entry.size > limit:
            issues.append(Issue(
                rule_id="R07",
                code="file_oversized",
                severity="suggestion",
                title="File exceeds size threshold",
                description="File size is above the configured limit. Size alone does not imply runtime cost.",
                files=[entry.relative],
                evidence=[f"{entry.size} bytes, limit {limit}"],
                suggestion="Review compression or format choice for this asset.",
            ))
    return issues


@rule("R08", "1", "Naming: case-only collisions and special characters")
def naming(context):
    issues = []
    by_folder_lower = defaultdict(list)
    for entry in context.entries:
        by_folder_lower[(Path(entry.relative).parent.as_posix(), entry.path.name.lower())].append(entry)
    for group in by_folder_lower.values():
        if len(group) > 1:
            issues.append(Issue(
                rule_id="R08",
                code="name_case_collision",
                severity="warning",
                title="Names differ only by case",
                description="Case-insensitive file systems cannot tell these files apart.",
                files=[entry.relative for entry in group],
                evidence=["case-insensitive name collision"],
                suggestion="Rename one file so names are unique regardless of case.",
            ))
    for entry in context.entries:
        if SPECIAL_NAME.search(entry.path.name):
            issues.append(Issue(
                rule_id="R08",
                code="name_special_chars",
                severity="suggestion",
                title="File name contains spaces or special characters",
                description="Such names can break tools and build pipelines.",
                files=[entry.relative],
                evidence=[f"name: {entry.path.name}"],
                suggestion="Use letters, digits, dots, dashes, or underscores.",
            ))
    return issues


@rule("R09", "1", "Spine JSON structure (basic validation, JSON files with a skeleton key)")
def spine_json(context):
    issues = []
    for entry in context.entries:
        if entry.extension != ".json":
            continue
        context.check_cancelled()
        try:
            data = json.loads(entry.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            context.unchecked.append((entry.relative, "json_unreadable"))
            continue
        if not isinstance(data, dict) or "skeleton" not in data:
            continue
        result = validate_spine_json(data)
        if not result.success:
            issues.append(Issue(
                rule_id="R09",
                code="spine_json_invalid",
                severity="warning",
                title="Spine JSON structure problem",
                description="The skeleton JSON is missing required sections.",
                files=[entry.relative],
                evidence=list(result.errors),
                suggestion="Re-export the skeleton from Spine.",
            ))
    return issues


@rule("R13", "1", "File signatures for PNG, JPEG, WebP, WAV, OGG and GLB")
def file_signatures(context):
    supported = {".png", ".jpg", ".jpeg", ".webp", ".wav", ".ogg", ".glb"}
    issues = []
    for entry in context.entries:
        if entry.extension not in supported:
            continue
        context.check_cancelled()
        try:
            with entry.path.open("rb") as handle:
                header = handle.read(16)
        except OSError:
            context.unchecked.append((entry.relative, "signature_unreadable"))
            continue
        matches = {
            ".png": header.startswith(b"\x89PNG\r\n\x1a\n"),
            ".jpg": header.startswith(b"\xff\xd8\xff"),
            ".jpeg": header.startswith(b"\xff\xd8\xff"),
            ".webp": header.startswith(b"RIFF") and header[8:12] == b"WEBP",
            ".wav": header.startswith(b"RIFF") and header[8:12] == b"WAVE",
            ".ogg": header.startswith(b"OggS"),
            ".glb": header.startswith(b"glTF"),
        }
        if not matches[entry.extension]:
            issues.append(Issue("R13", "format_mismatch", "warning", "File signature does not match its extension",
                                "The file header is not recognized as the expected format.", [entry.relative],
                                [f"extension: {entry.extension}"], "Verify the file and re-export or rename it after checking its actual format."))
    return issues
