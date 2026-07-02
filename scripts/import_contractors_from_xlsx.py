from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def normalize_target(target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    if target.startswith("xl/"):
        return target
    return f"xl/{target}"


def parse_xlsx(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as zf:
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        relmap = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            shared_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in shared_root:
                shared_strings.append("".join(t.text or "" for t in si.iter(NS + "t")))

        def cell_value(cell) -> str:
            cell_type = cell.attrib.get("t")
            if cell_type == "inlineStr":
                inline = cell.find(NS + "is")
                if inline is None:
                    return ""
                return "".join(t.text or "" for t in inline.iter(NS + "t")).strip()

            value = cell.find(NS + "v")
            if value is None:
                return ""
            raw = (value.text or "").strip()
            if cell_type == "s" and raw:
                return shared_strings[int(raw)].strip()
            return raw

        first_sheet = workbook.find(NS + "sheets")[0]
        target = normalize_target(relmap[first_sheet.attrib[REL_NS + "id"]])
        sheet = ET.fromstring(zf.read(target))
        rows = sheet.find(NS + "sheetData")

        header: list[str] = []
        items: list[dict[str, str]] = []
        for idx, row in enumerate(rows):
            values = [cell_value(cell) for cell in row]
            if idx == 0:
                header = values
                continue
            if not any(values):
                continue
            record = {}
            for col_idx, key in enumerate(header):
                record[key] = values[col_idx] if col_idx < len(values) else ""
            items.append(record)
        return items


def build_notes(item: dict[str, str]) -> str:
    parts = [
        f"Сайт: {item.get('Сайт', '').strip()}" if item.get("Сайт", "").strip() else "",
        f"Статус контакта: {item.get('Статус контакта', '').strip()}" if item.get("Статус контакта", "").strip() else "",
        f"Приоритет: {item.get('Приоритет', '').strip()}" if item.get("Приоритет", "").strip() else "",
        f"Комментарий: {item.get('Комментарий для менеджера', '').strip()}" if item.get("Комментарий для менеджера", "").strip() else "",
        f"Результат звонка: {item.get('Результат звонка', '').strip()}" if item.get("Результат звонка", "").strip() else "",
        f"Дата контакта: {item.get('Дата контакта', '').strip()}" if item.get("Дата контакта", "").strip() else "",
        f"Ответственный: {item.get('Ответственный', '').strip()}" if item.get("Ответственный", "").strip() else "",
    ]
    return "\n".join(part for part in parts if part)


def split_contact(contact_raw: str) -> tuple[str, str]:
    text = (contact_raw or "").strip()
    if not text:
        return "", ""
    emails = re.findall(r"[\w.\-+%]+@[\w.\-]+\.[A-Za-z]{2,}", text)
    email = emails[0].lower() if emails else ""

    phones: list[str] = []
    for chunk in re.split(r"[;\n]", text):
        piece = chunk.strip()
        if not piece or "@" in piece or "еик" in piece.lower():
            continue
        digits = re.sub(r"\D", "", piece)
        if len(digits) < 7:
            continue
        if piece.startswith("+") or piece.startswith("0") or piece.startswith("("):
            phones.append(re.sub(r"\s+", " ", piece).strip(" ;,"))

    phone = "; ".join(dict.fromkeys(phones))
    return phone, email


def transform(item: dict[str, str]) -> dict[str, str]:
    phone, email = split_contact(item.get("Контакт (открытые источники)", ""))
    company_name = (item.get("Компания") or "").strip()
    return {
        "company_name": company_name,
        "contact_name": "",
        "phone": phone,
        "email": email,
        "city": (item.get("Город (база)") or "").strip(),
        "regions": (item.get("География работы") or "").strip(),
        "specialties": (item.get("Специализация") or "").strip(),
        "notes": build_notes(item),
        "is_active": True,
    }


def main() -> int:
    if len(sys.argv) < 2:
      print("Usage: import_contractors_from_xlsx.py <xlsx-path>", file=sys.stderr)
      return 1
    path = Path(sys.argv[1])
    rows = parse_xlsx(path)
    payload = [transform(row) for row in rows if (row.get("Компания") or "").strip()]
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
