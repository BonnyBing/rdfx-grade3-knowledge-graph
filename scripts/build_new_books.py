#!/usr/bin/env python3
"""Build graphs for the newly added textbooks and merge them into the master graph.

Original textbook files and the existing grade-3 / grade-5 graphs are left in place.
Cross-book edges are added only on the merged graph, so each book file stays self-contained.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "数据源"
PUBLIC = ROOT / "public"
DATE = "2026-09-29"

NODE_TYPES = [
    "subject",
    "domain",
    "unit",
    "lesson",
    "knowledge",
    "method",
    "standard",
    "competency",
    "cross_disciplinary_theme",
]
RELATIONS = [
    "contains",
    "teaches",
    "uses_method",
    "aligns_to",
    "develops",
    "prerequisite_of",
    "applies_to",
    "cross_links",
]


class Graph:
    def __init__(self, metadata: dict):
        self.metadata = metadata
        self.nodes: list[dict] = []
        self.edges: list[dict] = []
        self.ids: set[str] = set()

    def add(self, id_, type_, name, status="current_book", source=None, **extra):
        if id_ in self.ids:
            raise SystemExit(f"duplicate id {id_}")
        node = {
            "id": id_,
            "type": type_,
            "name": name,
            "status": status,
            "grade": self.metadata["grade"],
            "semester": self.metadata["semester"],
        }
        if source:
            node["source"] = source
        node.update(extra)
        self.nodes.append(node)
        self.ids.add(id_)
        return id_

    def edge(self, source, relation, target, alignment=None):
        item = {"source": source, "relation": relation, "target": target}
        if alignment:
            item["alignment"] = alignment
        self.edges.append(item)

    def payload(self) -> dict:
        return {
            "metadata": self.metadata,
            "node_types": NODE_TYPES,
            "relation_types": RELATIONS,
            "nodes": self.nodes,
            "edges": self.edges,
        }


def src_text(file_name: str, page, evidence: str) -> str:
    if isinstance(page, tuple):
        pages = f"书内{page[0]}—{page[1]}"
    else:
        pages = f"书内{page}"
    return f"{file_name}{pages}｜{evidence}"


def dump_book(graph: Graph, stem: str):
    payload = graph.payload()
    (SRC / f"{stem}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    machine = (
        f"# {graph.metadata['title']}（机器版）\n\n"
        "权威数据只有下面这一份 JSON。\n\n```json\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + "\n```\n"
    )
    (SRC / f"{stem}-机器版.md").write_text(machine, encoding="utf-8")
    (SRC / f"{stem}-阅读版.md").write_text(reading_md(graph), encoding="utf-8")
    return payload


def reading_md(graph: Graph) -> str:
    meta = graph.metadata
    units = [n for n in graph.nodes if n["type"] == "unit"]
    lessons = [n for n in graph.nodes if n["type"] == "lesson"]
    knowledge = [n for n in graph.nodes if n["type"] == "knowledge"]
    later = [n for n in graph.nodes if n["status"] == "stage_later"]
    lines = [
        f"# {meta['title']}（阅读版）",
        "",
        "## 1. 来源与分析口径",
        "",
        f"- 教材：{meta.get('textbook_file', '')}。{meta.get('edition', '')}",
        f"- 课标：{meta.get('standard_file', '未提供')}",
        f"- 页码：{meta.get('page_reference', '')}",
        f"- 口径：{meta.get('scope_note', '')}",
        "",
        "## 2. 图谱模型",
        "",
        "节点按学科、领域、单元、课次、知识点展开。方法技能、课标要求和核心素养横向连接。",
        "`current_book` 是本册实际出现的内容。`stage_later` 是同学段里本册还没有系统学习的要求。",
        "`standard_missing` 表示没有对应课标文件，不补写课标条文。",
        "",
        "## 3. 总体知识图谱",
        "",
        "```mermaid",
        "flowchart LR",
    ]
    subject = next(n for n in graph.nodes if n["type"] == "subject")
    lines.append(f'  {subject["id"]}["{subject["name"]}"]')
    for unit in units:
        safe = unit["name"].replace('"', "")
        lines.append(f'  {subject["id"]} --> {unit["id"]}["{safe}"]')
    lines += ["```", "", "## 4. 教材知识点与课标对齐", ""]
    lines.append("| 单元 | 课次 | 知识点 | 课标对齐 | 状态 | 来源 |")
    lines.append("|---|---|---|---|---|---|")
    teach = {}
    for edge in graph.edges:
        if edge["relation"] == "teaches":
            teach.setdefault(edge["source"], []).append(edge["target"])
    align = {}
    for edge in graph.edges:
        if edge["relation"] == "aligns_to":
            target = next(n["name"] for n in graph.nodes if n["id"] == edge["target"])
            align[edge["source"]] = f"{target}（{edge.get('alignment', '')}）"
    by_parent = {}
    for edge in graph.edges:
        if edge["relation"] == "contains":
            by_parent.setdefault(edge["source"], []).append(edge["target"])
    node_by_id = {n["id"]: n for n in graph.nodes}
    for unit in units:
        lesson_ids = [
            i
            for i in by_parent.get(unit["id"], [])
            if node_by_id[i]["type"] == "lesson"
        ]
        if not lesson_ids:
            lesson_ids = [unit["id"]]
        for lesson_id in lesson_ids:
            lesson = node_by_id[lesson_id]
            kids = [node_by_id[i]["name"] for i in teach.get(lesson_id, [])]
            if not kids and lesson["type"] == "unit":
                kids = [node_by_id[i]["name"] for i in teach.get(unit["id"], [])]
            kid_align = ""
            for kid_id in teach.get(lesson_id, []) + teach.get(unit["id"], []):
                if kid_id in align:
                    kid_align = align[kid_id]
                    break
            lines.append(
                "| {unit} | {lesson} | {kids} | {align} | {status} | {source} |".format(
                    unit=unit["name"],
                    lesson=lesson["name"] if lesson["type"] == "lesson" else "—",
                    kids="；".join(kids) or "—",
                    align=kid_align or "未对齐",
                    status=lesson["status"],
                    source=str(lesson.get("source", ""))[:80],
                )
            )
    lines += ["", "## 5. 学习进阶与前置关系", ""]
    pres = [e for e in graph.edges if e["relation"] == "prerequisite_of"]
    if pres:
        for edge in pres:
            a = node_by_id[edge["source"]]["name"]
            b = node_by_id[edge["target"]]["name"]
            lines.append(f"- {a} 前置于 {b}")
    else:
        lines.append("本册内部的前后关系体现在单元顺序。跨册进阶写在总图里。")
    lines += ["", "## 6. 跨学科关联", "", meta.get("cross_note", "本册文件不写指向其他册的边。真实关联在总图中单列。"), ""]
    lines += ["## 7. 本册未覆盖的学段后续要求", ""]
    if later:
        for node in later:
            lines.append(f"- {node['name']}")
    else:
        lines.append("- 本册没有另列同学段未学条目。")
    lines += ["", "## 8. 结论与限制", "", meta.get("limits", ""), ""]
    return "\n".join(lines)


def add_tree(graph: Graph, subject_id: str, domains: list[dict], file_name: str):
    for domain in domains:
        graph.add(domain["id"], "domain", domain["name"], source=domain.get("source"))
        graph.edge(subject_id, "contains", domain["id"])
        for unit in domain["units"]:
            graph.add(
                unit["id"],
                "unit",
                unit["name"],
                source=src_text(file_name, unit["page"], unit["name"]),
            )
            graph.edge(domain["id"], "contains", unit["id"])
            for method_id in unit.get("methods", []):
                graph.edge(unit["id"], "uses_method", method_id)
            for lesson in unit.get("lessons", []):
                graph.add(
                    lesson["id"],
                    "lesson",
                    lesson["name"],
                    source=src_text(file_name, lesson["page"], lesson["name"]),
                )
                graph.edge(unit["id"], "contains", lesson["id"])
                if lesson.get("knowledge"):
                    kid = lesson["knowledge"]
                    graph.add(
                        kid["id"],
                        "knowledge",
                        kid["name"],
                        source=src_text(file_name, lesson["page"], kid["name"]),
                    )
                    graph.edge(lesson["id"], "teaches", kid["id"])
                    if kid.get("standard"):
                        graph.edge(
                            kid["id"],
                            "aligns_to",
                            kid["standard"],
                            kid.get("alignment", "direct"),
                        )
                    for method_id in lesson.get("methods", []):
                        graph.edge(kid["id"], "uses_method", method_id)


def finalize_shared(graph: Graph, subject_id: str, shared: dict):
    for item in shared.get("methods", []):
        graph.add(item["id"], "method", item["name"], source=item["source"])
        graph.edge(subject_id, "contains", item["id"])
    for item in shared.get("standards", []):
        graph.add(
            item["id"],
            "standard",
            item["name"],
            status=item.get("status", "stage_standard"),
            source=item["source"],
        )
        graph.edge(subject_id, "contains", item["id"])
    for item in shared.get("competencies", []):
        graph.add(item["id"], "competency", item["name"], source=item["source"])
        graph.edge(subject_id, "develops", item["id"])
    for item in shared.get("later", []):
        graph.add(
            item["id"],
            "standard",
            item["name"],
            status="stage_later",
            source=item["source"],
        )
        graph.edge(subject_id, "contains", item["id"])


def meta_for(title, grade, semester, subjects, textbook, edition, standard, scope, limits, cross):
    return {
        "title": title,
        "version": "1.0",
        "generated_date": DATE,
        "grade": grade,
        "semester": semester,
        "subjects": subjects,
        "textbook_file": textbook,
        "edition": edition,
        "standard_file": standard,
        "scope_note": scope,
        "page_reference": "书内页来自教材目录和课题页。这些 Markdown 没有可靠的 PDF 页码，不编造 PDF 页。",
        "source_files": [textbook] + ([standard] if standard and "未提供" not in standard else []),
        "limits": limits,
        "cross_note": cross,
    }


MATH_STD = "（5）义务教育数学课程标准日常修订版（2022年版2025年修订）.md"
SCI_STD = "（10）义务教育科学课程标准日常修订版（2022年版2025年修订）.md"
MATH_LIMIT = (
    "数学教材封面写明 2026 秋季新教材，课标是 2022 年版、2025 年修订。"
    "主题一致不等于逐条完全覆盖。Markdown 由教材转换而来，表格和个别标题有识别误差，知识点以正文和「我的收获」核对过的表述为准。"
)
SCI_LIMIT = (
    "科学教材为教育科学出版社义务教育教科书。课标按六三学制 3～4 年级或 5～6 年级内容要求对齐。"
    "课次名称取自目录并在正文课题中出现。没有把练习情境写成核心知识点。"
)
CHI_STD = "（3）义务教育语文课程标准日常修订版（2022年版2025年修订）.md"
CHI_LIMIT = (
    "语文课标是 2022 年版、2025 年修订。四年级上对齐第二学段（3～4年级），五、六年级上对齐第三学段（5～6年级）。"
    "学段要求跨学期，本册没有系统安排的条目标为 stage_later，不写成已经掌握。"
    "知识点仍只采用教材单元导语和课题里写出的学习要求。六年级文言文相对第三学段最低要求标为 extension。"
)


def build_math4() -> Graph:
    file_name = "四年级上数学.md"
    g = Graph(
        meta_for(
            "四年级上册数学知识图谱",
            "四年级",
            "上册",
            ["数学"],
            file_name,
            "北京师范大学出版社组织编写，封面为 2026 秋季新教材",
            MATH_STD,
            "只把本册实际出现的内容标为 current_book。3～4 年级里本册没有系统学习的要求标为 stage_later。",
            MATH_LIMIT,
            "总图中把「速度、时间与路程」和五年级语文《什么比猎豹的速度更快》相连，因为本册用猎豹、声音和光的速度说明路程、速度与时间的关系。",
        )
    )
    g.add("M4", "subject", "数学四年级上", order=3, source="四年级上数学.md封面｜北京师范大学组织编写，四年级上册")
    std = "数学课标第二学段"
    finalize_shared(
        g,
        "M4",
        {
            "methods": [
                {"id": "M4-M-PLACE", "name": "按数位顺序表分级读写", "source": src_text(file_name, (2, 18), "我的收获：读写大数先分级")},
                {"id": "M4-M-ROUND", "name": "四舍五入", "source": src_text(file_name, (2, 18), "四舍五入到万位、亿位")},
                {"id": "M4-M-MEASURE", "name": "用量角器量角、画角", "source": src_text(file_name, (23, 38), "角的度量")},
                {"id": "M4-M-CALC", "name": "把乘数拆成整百、整十和一位数再乘", "source": src_text(file_name, (39, 57), "我的收获")},
                {"id": "M4-M-CALC2", "name": "用计算器计算", "source": src_text(file_name, (39, 57), "神奇的计算工具")},
                {"id": "M4-M-BAR", "name": "调查数据并画条形统计图", "source": src_text(file_name, (94, 98), "同学的生日")},
            ],
            "standards": [
                {"id": "M4-STD-BIG", "name": "在具体情境中认识万以上的数，了解十进制计数法", "source": f"{std}数与运算（1）"},
                {"id": "M4-STD-MUL", "name": "探索并掌握多位数乘除法；能计算两位数乘三位数", "source": f"{std}数与运算（1）及学业要求"},
                {"id": "M4-STD-LAW", "name": "探索并理解运算律，能用字母表示运算律", "source": f"{std}数与运算（4）"},
                {"id": "M4-STD-CALC", "name": "能借助计算器进行计算，探索简单规律", "source": f"{std}数量关系（2）"},
                {"id": "M4-STD-REL", "name": "认识总量等于分量之和、总价等于单价乘数量、路程等于速度乘时间", "source": f"{std}数量关系（3）"},
                {"id": "M4-STD-LINE", "name": "结合实例认识线段、射线和直线，了解同一平面内两条直线的位置关系", "source": f"{std}图形的认识与测量（1）"},
                {"id": "M4-STD-ANG", "name": "认识角，会用量角器量角、画角", "source": f"{std}图形的认识与测量（2）"},
                {"id": "M4-STD-MOVE", "name": "结合实例感受平移、旋转、轴对称现象", "source": f"{std}图形的位置与运动（1）"},
                {"id": "M4-STD-VIEW", "name": "能根据具体事物、照片或直观图辨认从不同角度观察到的简单物体", "source": f"{std}图形的认识与测量（6）"},
                {"id": "M4-STD-DATA", "name": "经历数据收集、整理和表达，认识条形统计图", "source": f"{std}数据的收集、整理与表达"},
                {"id": "M4-STD-CODE", "name": "会运用数描述生活情境中事物的特征", "source": f"{std}数与运算（5）"},
            ],
            "competencies": [
                {"id": "M4-C-SENSE", "name": "数感", "source": f"{std}学业要求：形成数感"},
                {"id": "M4-C-OP", "name": "运算能力", "source": f"{std}学业要求：形成运算能力"},
                {"id": "M4-C-SPACE", "name": "空间观念", "source": f"{std}图形认识：形成空间观念"},
                {"id": "M4-C-DATA", "name": "数据意识", "source": f"{std}统计：形成初步的数据意识"},
                {"id": "M4-C-MODEL", "name": "模型意识", "source": f"{std}数量关系：形成初步的模型意识"},
            ],
            "later": [
                {"id": "M4-LATER-FRAC", "name": "本册未学：初步认识小数和分数，同分母分数加减和一位小数加减", "source": f"{std}数与运算（2）"},
                {"id": "M4-LATER-AVG", "name": "本册未学：平均数", "source": f"{std}数据的收集、整理与表达（5）"},
                {"id": "M4-LATER-AREA", "name": "本册未学：长方形、正方形的周长和面积公式，三角形和四边形的分类", "source": f"{std}图形的认识与测量（4）（5）"},
                {"id": "M4-LATER-EQ", "name": "本册未学：等量的等量相等", "source": f"{std}数量关系（4）"},
            ],
        },
    )
    add_tree(
        g,
        "M4",
        [
            {
                "id": "M4-D-N",
                "name": "数与代数",
                "units": [
                    {
                        "id": "M4-U-BIG",
                        "name": "认识更大的数",
                        "page": 2,
                        "methods": ["M4-M-PLACE", "M4-M-ROUND"],
                        "lessons": [
                            {
                                "id": "M4-U-BIG-L1",
                                "name": "数说祖国",
                                "page": 2,
                                "knowledge": {
                                    "id": "M4-K-PLACE",
                                    "name": "读写大数要先按个级、万级、亿级分级",
                                    "standard": "M4-STD-BIG",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-BIG-L2",
                                "name": "认识更大的数",
                                "page": 2,
                                "knowledge": {
                                    "id": "M4-K-TABLE",
                                    "name": "借助数位顺序表认识和读写大数",
                                    "standard": "M4-STD-BIG",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-BIG-L3",
                                "name": "人口普查",
                                "page": 2,
                                "knowledge": {
                                    "id": "M4-K-ROUND",
                                    "name": "用四舍五入把大数改写成用万或亿作单位的近似数",
                                    "standard": "M4-STD-BIG",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-BIG-L4",
                                "name": "从结绳计数说起",
                                "page": 2,
                                "knowledge": {
                                    "id": "M4-K-HIST",
                                    "name": "了解结绳、玛雅数字和中国算筹等计数方法",
                                    "standard": "M4-STD-BIG",
                                    "alignment": "extension",
                                },
                            },
                        ],
                    },
                    {
                        "id": "M4-U-MUL",
                        "name": "整数乘法（二）",
                        "page": 39,
                        "methods": ["M4-M-CALC", "M4-M-CALC2"],
                        "lessons": [
                            {
                                "id": "M4-U-MUL-L1",
                                "name": "三位数乘两位数",
                                "page": 39,
                                "knowledge": {
                                    "id": "M4-K-MUL",
                                    "name": "三位数乘两位数可以拆成整十数和一位数再相加",
                                    "standard": "M4-STD-MUL",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-MUL-L2",
                                "name": "神奇的计算工具",
                                "page": 39,
                                "knowledge": {
                                    "id": "M4-K-CALC",
                                    "name": "计算器是常用计算工具，可以用来计算和核对",
                                    "standard": "M4-STD-CALC",
                                    "alignment": "direct",
                                },
                            },
                        ],
                    },
                    {
                        "id": "M4-U-LAW",
                        "name": "运算律",
                        "page": 63,
                        "lessons": [
                            {
                                "id": "M4-U-LAW-L1",
                                "name": "加法交换律和乘法交换律",
                                "page": 63,
                                "knowledge": {
                                    "id": "M4-K-COMM",
                                    "name": "加法交换律和乘法交换律",
                                    "standard": "M4-STD-LAW",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-LAW-L2",
                                "name": "加法结合律和乘法结合律",
                                "page": 63,
                                "knowledge": {
                                    "id": "M4-K-ASSOC",
                                    "name": "加法结合律和乘法结合律",
                                    "standard": "M4-STD-LAW",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-LAW-L3",
                                "name": "乘法分配律",
                                "page": 63,
                                "knowledge": {
                                    "id": "M4-K-DIST",
                                    "name": "乘法分配律",
                                    "standard": "M4-STD-LAW",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-LAW-L4",
                                "name": "用字母表示运算律",
                                "page": 63,
                                "knowledge": {
                                    "id": "M4-K-LETTER",
                                    "name": "尝试用字母表示运算律",
                                    "standard": "M4-STD-LAW",
                                    "alignment": "partial",
                                },
                            },
                        ],
                    },
                    {
                        "id": "M4-U-REL",
                        "name": "运用数量关系解决问题",
                        "page": 85,
                        "lessons": [
                            {
                                "id": "M4-U-REL-L1",
                                "name": "总量与分量",
                                "page": 85,
                                "knowledge": {
                                    "id": "M4-K-SUM",
                                    "name": "总量等于各分量之和",
                                    "standard": "M4-STD-REL",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-REL-L2",
                                "name": "单价、数量与总价",
                                "page": 85,
                                "knowledge": {
                                    "id": "M4-K-PRICE",
                                    "name": "总价等于单价乘数量",
                                    "standard": "M4-STD-REL",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-REL-L3",
                                "name": "速度、时间与路程",
                                "page": 85,
                                "knowledge": {
                                    "id": "M4-K-SPEED",
                                    "name": "路程等于速度乘时间，速度是单位时间走过的路程",
                                    "standard": "M4-STD-REL",
                                    "alignment": "direct",
                                },
                            },
                        ],
                    },
                ],
            },
            {
                "id": "M4-D-G",
                "name": "图形与几何",
                "units": [
                    {
                        "id": "M4-U-LINE",
                        "name": "线与角",
                        "page": 23,
                        "methods": ["M4-M-MEASURE"],
                        "lessons": [
                            {
                                "id": "M4-U-LINE-L1",
                                "name": "线的认识",
                                "page": 23,
                                "knowledge": {
                                    "id": "M4-K-LINE",
                                    "name": "线段有两个端点且长度有限，射线有一个端点，直线没有端点",
                                    "standard": "M4-STD-LINE",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-LINE-L2",
                                "name": "相交与垂直",
                                "page": 23,
                                "knowledge": {
                                    "id": "M4-K-PERP",
                                    "name": "同一平面内两条直线相交，其中一种特殊情况是垂直",
                                    "standard": "M4-STD-LINE",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-LINE-L3",
                                "name": "平移与平行",
                                "page": 23,
                                "knowledge": {
                                    "id": "M4-K-PARA",
                                    "name": "平移可以得到平行线",
                                    "standard": "M4-STD-MOVE",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-LINE-L4",
                                "name": "旋转与角",
                                "page": 23,
                                "knowledge": {
                                    "id": "M4-K-ANGLE",
                                    "name": "角可以由一条射线绕端点旋转得到",
                                    "standard": "M4-STD-ANG",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M4-U-LINE-L5",
                                "name": "角的度量",
                                "page": 23,
                                "knowledge": {
                                    "id": "M4-K-PROT",
                                    "name": "用量角器量角，并先估再量",
                                    "standard": "M4-STD-ANG",
                                    "alignment": "direct",
                                },
                            },
                        ],
                    },
                    {
                        "id": "M4-U-SPACE",
                        "name": "我们生活的空间（二）",
                        "page": 58,
                        "lessons": [
                            {
                                "id": "M4-U-SPACE-L1",
                                "name": "观察的范围",
                                "page": 58,
                                "knowledge": {
                                    "id": "M4-K-VIEW",
                                    "name": "观察者位置改变，能看到的范围会改变",
                                    "standard": "M4-STD-VIEW",
                                    "alignment": "partial",
                                },
                            }
                        ],
                    },
                    {
                        "id": "M4-U-CUT",
                        "name": "图形的奥秘",
                        "page": 79,
                        "lessons": [
                            {
                                "id": "M4-U-CUT-L1",
                                "name": "切开立体图形",
                                "page": 79,
                                "knowledge": {
                                    "id": "M4-K-CUT",
                                    "name": "切开立体图形，观察截面",
                                    "standard": "M4-STD-VIEW",
                                    "alignment": "extension",
                                },
                            }
                        ],
                    },
                ],
            },
            {
                "id": "M4-D-D",
                "name": "统计与概率",
                "units": [
                    {
                        "id": "M4-U-DATA",
                        "name": "数据的表示和分析（一）",
                        "page": 94,
                        "methods": ["M4-M-BAR"],
                        "lessons": [
                            {
                                "id": "M4-U-DATA-L1",
                                "name": "同学的生日",
                                "page": 94,
                                "knowledge": {
                                    "id": "M4-K-BAR",
                                    "name": "把调查结果画成条形统计图，可以比较各类数量多少",
                                    "standard": "M4-STD-DATA",
                                    "alignment": "direct",
                                },
                            }
                        ],
                    }
                ],
            },
            {
                "id": "M4-D-P",
                "name": "综合与实践",
                "units": [
                    {
                        "id": "M4-U-CODE",
                        "name": "编码",
                        "page": 19,
                        "lessons": [
                            {
                                "id": "M4-U-CODE-L1",
                                "name": "生活中的编码",
                                "page": 19,
                                "knowledge": {
                                    "id": "M4-K-CODE",
                                    "name": "编码用数字表示事物的身份和信息",
                                    "standard": "M4-STD-CODE",
                                    "alignment": "partial",
                                },
                            }
                        ],
                    },
                    {
                        "id": "M4-U-ROUTE",
                        "name": "数图形的学问",
                        "page": 77,
                        "lessons": [
                            {
                                "id": "M4-U-ROUTE-L1",
                                "name": "数不同路线",
                                "page": 77,
                                "knowledge": {
                                    "id": "M4-K-ROUTE",
                                    "name": "按入口和出口有顺序地数出不同路线",
                                    "standard": "M4-STD-CALC",
                                    "alignment": "extension",
                                },
                            }
                        ],
                    },
                    {
                        "id": "M4-U-NAV",
                        "name": "导航给的时间准吗",
                        "page": 99,
                        "lessons": [
                            {
                                "id": "M4-U-NAV-L1",
                                "name": "出行导航",
                                "page": 99,
                                "methods": ["M4-M-BAR"],
                                "knowledge": {
                                    "id": "M4-K-NAV",
                                    "name": "导航时间是预计时间，要和实际出行时间对照",
                                    "standard": "M4-STD-REL",
                                    "alignment": "partial",
                                },
                            }
                        ],
                    },
                ],
            },
        ],
        file_name,
    )
    g.edge("M4-K-LINE", "prerequisite_of", "M4-K-PERP")
    g.edge("M4-K-ANGLE", "prerequisite_of", "M4-K-PROT")
    g.edge("M4-K-MUL", "prerequisite_of", "M4-K-DIST")
    g.edge("M4-K-SPEED", "prerequisite_of", "M4-K-NAV")
    return g


def build_math6() -> Graph:
    file_name = "六年级上数学.md"
    g = Graph(
        meta_for(
            "六年级上册数学知识图谱",
            "六年级",
            "上册",
            ["数学"],
            file_name,
            "北京师范大学出版社组织编写，封面为 2026 秋季新教材",
            MATH_STD,
            "对齐 5～6 年级内容要求。本册没有系统学习的同学段要求标为 stage_later。",
            MATH_LIMIT,
            "总图把制订节水方案、制订营养食谱、车轮为什么是圆的，分别连到科学相应课次。",
        )
    )
    g.add("M6", "subject", "数学六年级上", order=5, source="六年级上数学.md封面｜北京师范大学组织编写，六年级上册")
    std = "数学课标第三学段"
    finalize_shared(
        g,
        "M6",
        {
            "methods": [
                {"id": "M6-M-INV", "name": "分数除以整数转化为乘倒数", "source": src_text(file_name, 2, "4/5÷2=4/5×1/2")},
                {"id": "M6-M-CIRCLE", "name": "用圆规画圆", "source": src_text(file_name, 11, "圆的认识")},
                {"id": "M6-M-LETTER", "name": "用字母表示数量关系和规律", "source": src_text(file_name, 33, "用字母表示数量关系")},
                {"id": "M6-M-STAT", "name": "选择折线统计图或扇形统计图表达数据", "source": src_text(file_name, 91, "数据的表示和分析（三）")},
            ],
            "standards": [
                {"id": "M6-STD-FRAC", "name": "能进行简单的分数四则运算，理解整数除法与分数的关系", "source": f"{std}数与运算（3）（4）"},
                {"id": "M6-STD-LET", "name": "探索用字母表示事物的关系、性质和规律", "source": f"{std}数量关系（3）"},
                {"id": "M6-STD-RATIO", "name": "在实际情境中理解比和比例，能解决简单问题", "source": f"{std}数量关系（4）"},
                {"id": "M6-STD-CIR", "name": "认识圆和扇形，认识圆周率，探索圆的周长和面积", "source": f"{std}图形的认识与测量（2）"},
                {"id": "M6-STD-POS", "name": "根据参照点的方向和距离确定位置，用有序数对表示点的位置", "source": f"{std}图形的位置与运动（1）（2）"},
                {"id": "M6-STD-VIEW", "name": "辨认简单物体前面、侧面、上面的形状图", "source": f"{std}图形的认识与测量（6）"},
                {"id": "M6-STD-PCT", "name": "探索百分数的意义，解决与百分数有关的简单实际问题", "source": f"{std}数据的收集、整理与表达（4）"},
                {"id": "M6-STD-GRAPH", "name": "认识折线统计图、扇形统计图，解释所表达的意义", "source": f"{std}数据的收集、整理与表达（2）"},
            ],
            "competencies": [
                {"id": "M6-C-OP", "name": "运算能力", "source": f"{std}学业要求"},
                {"id": "M6-C-SYMBOL", "name": "符号意识", "source": f"{std}用字母表示的教学提示"},
                {"id": "M6-C-SPACE", "name": "空间观念和几何直观", "source": f"{std}图形认识学业要求"},
                {"id": "M6-C-DATA", "name": "数据意识", "source": f"{std}百分数和统计图学业要求"},
                {"id": "M6-C-MODEL", "name": "模型意识", "source": f"{std}数量关系学业要求"},
            ],
            "later": [
                {"id": "M6-LATER-PRIME", "name": "本册未学：2、3、5的倍数特征，公因数、公倍数，质数和合数", "source": f"{std}数与运算（1）"},
                {"id": "M6-LATER-PROP", "name": "本册未学：成正比的量，以及按比例分配", "source": f"{std}数量关系（4）（5）"},
                {"id": "M6-LATER-VOL", "name": "本册未学：长方体、正方体、圆柱、圆锥的体积和表面积", "source": f"{std}图形的认识与测量（5）"},
                {"id": "M6-LATER-SCALE", "name": "本册未学：比例尺，以及方格纸上的平移、旋转和轴对称", "source": f"{std}图形的位置与运动（3）（4）"},
                {"id": "M6-LATER-RAND", "name": "本册未学：随机现象发生的可能性", "source": f"{std}随机现象发生的可能性"},
            ],
        },
    )
    add_tree(
        g,
        "M6",
        [
            {
                "id": "M6-D-N",
                "name": "数与代数",
                "units": [
                    {
                        "id": "M6-U-DIV",
                        "name": "分数除法",
                        "page": 2,
                        "methods": ["M6-M-INV"],
                        "lessons": [
                            {
                                "id": "M6-U-DIV-L1",
                                "name": "分数除法（一）",
                                "page": 2,
                                "knowledge": {
                                    "id": "M6-K-DIV1",
                                    "name": "分数除以整数，等于乘这个整数的倒数",
                                    "standard": "M6-STD-FRAC",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M6-U-DIV-L2",
                                "name": "分数除法（二）（三）",
                                "page": 2,
                                "knowledge": {
                                    "id": "M6-K-DIV2",
                                    "name": "分数除法和分数乘法、整数除法有联系",
                                    "standard": "M6-STD-FRAC",
                                    "alignment": "direct",
                                },
                            },
                        ],
                    },
                    {
                        "id": "M6-U-LET",
                        "name": "用字母表示（二）",
                        "page": 33,
                        "methods": ["M6-M-LETTER"],
                        "lessons": [
                            {
                                "id": "M6-U-LET-L1",
                                "name": "用字母表示数量关系",
                                "page": 33,
                                "knowledge": {
                                    "id": "M6-K-LET",
                                    "name": "用字母表示数量关系、规律和图形公式",
                                    "standard": "M6-STD-LET",
                                    "alignment": "direct",
                                },
                            }
                        ],
                    },
                    {
                        "id": "M6-U-APP",
                        "name": "分数的应用",
                        "page": 49,
                        "lessons": [
                            {
                                "id": "M6-U-APP-L1",
                                "name": "分数的应用",
                                "page": 49,
                                "knowledge": {
                                    "id": "M6-K-APP",
                                    "name": "一个量是另一个量的几分之几时，可以分步求出未知量",
                                    "standard": "M6-STD-FRAC",
                                    "alignment": "direct",
                                },
                            }
                        ],
                    },
                    {
                        "id": "M6-U-RATIO",
                        "name": "比的认识",
                        "page": 57,
                        "lessons": [
                            {
                                "id": "M6-U-RATIO-L1",
                                "name": "生活中的比",
                                "page": 57,
                                "knowledge": {
                                    "id": "M6-K-RATIO",
                                    "name": "比表示两个数量的倍数关系，比值可以由除法得到",
                                    "standard": "M6-STD-RATIO",
                                    "alignment": "partial",
                                },
                            },
                            {
                                "id": "M6-U-RATIO-L2",
                                "name": "比的化简",
                                "page": 57,
                                "knowledge": {
                                    "id": "M6-K-RATIO2",
                                    "name": "比的前项和后项同时乘或除以同一个不为 0 的数，比值不变",
                                    "standard": "M6-STD-RATIO",
                                    "alignment": "partial",
                                },
                            },
                        ],
                    },
                    {
                        "id": "M6-U-PCT",
                        "name": "百分数的认识与应用（一）",
                        "page": 75,
                        "lessons": [
                            {
                                "id": "M6-U-PCT-L1",
                                "name": "百分数的意义",
                                "page": 75,
                                "knowledge": {
                                    "id": "M6-K-PCT",
                                    "name": "百分数表示一个数是另一个数的百分之几，也可以表示部分与整体的关系",
                                    "standard": "M6-STD-PCT",
                                    "alignment": "direct",
                                },
                            }
                        ],
                    },
                ],
            },
            {
                "id": "M6-D-G",
                "name": "图形与几何",
                "units": [
                    {
                        "id": "M6-U-CIR",
                        "name": "圆",
                        "page": 11,
                        "methods": ["M6-M-CIRCLE"],
                        "lessons": [
                            {
                                "id": "M6-U-CIR-L1",
                                "name": "车轮为什么是圆的",
                                "page": 11,
                                "knowledge": {
                                    "id": "M6-K-WHYCIR",
                                    "name": "圆上各点到圆心的距离相等，所以车轮做成圆形",
                                    "standard": "M6-STD-CIR",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M6-U-CIR-L2",
                                "name": "圆的认识",
                                "page": 11,
                                "knowledge": {
                                    "id": "M6-K-CIR",
                                    "name": "圆有圆心、半径和直径，直径等于半径的 2 倍，圆是轴对称图形",
                                    "standard": "M6-STD-CIR",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M6-U-CIR-L3",
                                "name": "圆的周长",
                                "page": 11,
                                "knowledge": {
                                    "id": "M6-K-C",
                                    "name": "圆的周长公式是 C=πd 或 C=2πr",
                                    "standard": "M6-STD-CIR",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M6-U-CIR-L4",
                                "name": "圆的面积",
                                "page": 11,
                                "knowledge": {
                                    "id": "M6-K-AREA",
                                    "name": "把圆分成扇形再拼成近似平行四边形，探索圆的面积",
                                    "standard": "M6-STD-CIR",
                                    "alignment": "direct",
                                },
                            },
                        ],
                    },
                    {
                        "id": "M6-U-POS",
                        "name": "确定位置",
                        "page": 67,
                        "lessons": [
                            {
                                "id": "M6-U-POS-L1",
                                "name": "象群北迁",
                                "page": 67,
                                "knowledge": {
                                    "id": "M6-K-POS",
                                    "name": "用方向描述位置，例如东北方向",
                                    "standard": "M6-STD-POS",
                                    "alignment": "direct",
                                },
                            },
                            {
                                "id": "M6-U-POS-L2",
                                "name": "用数对确定位置",
                                "page": 67,
                                "knowledge": {
                                    "id": "M6-K-PAIR",
                                    "name": "用数对表示方格图上的位置，需要两个要素",
                                    "standard": "M6-STD-POS",
                                    "alignment": "direct",
                                },
                            },
                        ],
                    },
                    {
                        "id": "M6-U-VIEW",
                        "name": "观察物体（二）",
                        "page": 86,
                        "lessons": [
                            {
                                "id": "M6-U-VIEW-L1",
                                "name": "有趣的投影",
                                "page": 86,
                                "knowledge": {
                                    "id": "M6-K-VIEW",
                                    "name": "从上面、正面和侧面观察圆柱和圆锥，看到的形状不同",
                                    "standard": "M6-STD-VIEW",
                                    "alignment": "direct",
                                },
                            }
                        ],
                    },
                ],
            },
            {
                "id": "M6-D-D",
                "name": "统计与概率",
                "units": [
                    {
                        "id": "M6-U-DATA",
                        "name": "数据的表示和分析（三）",
                        "page": 91,
                        "methods": ["M6-M-STAT"],
                        "lessons": [
                            {
                                "id": "M6-U-DATA-L1",
                                "name": "选择统计图",
                                "page": 91,
                                "knowledge": {
                                    "id": "M6-K-LINE",
                                    "name": "折线统计图反映变化情况，扇形统计图表示各部分占总体的百分比",
                                    "standard": "M6-STD-GRAPH",
                                    "alignment": "direct",
                                },
                            }
                        ],
                    }
                ],
            },
            {
                "id": "M6-D-P",
                "name": "综合与实践",
                "units": [
                    {
                        "id": "M6-U-WATER",
                        "name": "制订节水方案",
                        "page": 44,
                        "lessons": [
                            {
                                "id": "M6-U-WATER-L1",
                                "name": "调查用水并做滴水实验",
                                "page": 44,
                                "knowledge": {
                                    "id": "M6-K-WATER",
                                    "name": "调查用水情况，用滴水实验的数据制订节水方案",
                                    "standard": "M6-STD-GRAPH",
                                    "alignment": "partial",
                                },
                            }
                        ],
                    },
                    {
                        "id": "M6-U-FOOD",
                        "name": "制订营养食谱",
                        "page": 103,
                        "lessons": [
                            {
                                "id": "M6-U-FOOD-L1",
                                "name": "一日三餐",
                                "page": 103,
                                "knowledge": {
                                    "id": "M6-K-FOOD",
                                    "name": "用扇形统计图整理饮食调查，分析怎样实现营养均衡",
                                    "standard": "M6-STD-PCT",
                                    "alignment": "partial",
                                },
                            }
                        ],
                    },
                    {
                        "id": "M6-U-GO",
                        "name": "五子棋",
                        "page": 73,
                        "lessons": [
                            {
                                "id": "M6-U-GO-L1",
                                "name": "五子棋的规则",
                                "page": 73,
                                "knowledge": {
                                    "id": "M6-K-GO",
                                    "name": "五子棋双方轮流落子，先把五子连成一条直线的一方获胜",
                                    "standard": "M6-STD-POS",
                                    "alignment": "extension",
                                },
                            }
                        ],
                    },
                ],
            },
        ],
        file_name,
    )
    g.edge("M6-K-DIV1", "prerequisite_of", "M6-K-APP")
    g.edge("M6-K-CIR", "prerequisite_of", "M6-K-C")
    g.edge("M6-K-C", "prerequisite_of", "M6-K-AREA")
    g.edge("M6-K-RATIO", "prerequisite_of", "M6-K-RATIO2")
    g.edge("M6-K-PCT", "prerequisite_of", "M6-K-LINE")
    return g


def science_books() -> list[Graph]:
    books = []

    def lesson(prefix, index, page, name, standard, alignment="direct"):
        return {
            "id": f"{prefix}-L{index}",
            "name": name,
            "page": page,
            "knowledge": {
                "id": f"{prefix}-K{index}",
                "name": name,
                "standard": standard,
                "alignment": alignment,
            },
        }

    specs = [
        {
            "id": "S4U",
            "title": "四年级上册科学知识图谱",
            "grade": "四年级",
            "semester": "上册",
            "order": 3,
            "file": "四年级上科学.md",
            "stage": "科学课标3～4年级",
            "domains": [
                (
                    "声音",
                    "物质科学：声音",
                    2,
                    "S4U-STD-SOUND",
                    [
                        (2, "听听声音"),
                        (4, "声音是怎样产生的"),
                        (6, "声音是怎样传播的"),
                        (9, "我们是怎样听到声音的"),
                        (11, "声音的强与弱"),
                        (13, "声音的高与低"),
                        (16, "让弦发出高低不同的声音"),
                        (18, "制作我的小乐器"),
                    ],
                ),
                (
                    "呼吸与消化",
                    "生命科学：呼吸与消化",
                    21,
                    "S4U-STD-BODY",
                    [
                        (21, "感受我们的呼吸"),
                        (23, "呼吸与健康生活"),
                        (25, "测量肺活量"),
                        (27, "一天的食物"),
                        (30, "食物中的营养"),
                        (32, "营养要均衡"),
                        (34, "食物在口腔里的变化"),
                        (37, "食物在身体里的旅行"),
                    ],
                ),
                (
                    "运动和力",
                    "物质科学：运动和力",
                    41,
                    "S4U-STD-FORCE",
                    [
                        (41, "让小车运动起来"),
                        (44, "用气球驱动小车"),
                        (46, "用橡皮筋驱动小车"),
                        (48, "弹簧测力计"),
                        (51, "运动与摩擦力", "extension"),
                        (54, "运动的小车"),
                        (56, "设计制作小车（一）"),
                        (58, "设计制作小车（二）"),
                    ],
                ),
            ],
            "standards": [
                ("S4U-STD-SOUND", "举例说明声音因物体振动产生，能向各个方向传播，有高低和强弱"),
                ("S4U-STD-BODY", "描述人体用于呼吸和摄取养分的器官，列举保护方法"),
                ("S4U-STD-FORCE", "用速度描述运动快慢，描述直线和曲线等运动方式，知道测量距离和时间的常用方法"),
            ],
            "later": [
                ("S4U-LATER-CIR", "本册未学：电路、导体和绝缘体"),
                ("S4U-LATER-PLANT", "本册未学：绿色开花植物的一生"),
                ("S4U-LATER-SOIL", "本册未学：土壤的主要成分"),
            ],
            "cross": "总图把「我们是怎样听到声音的」和四年级语文《夜间飞行的秘密》相连。",
        },
        {
            "id": "S4D",
            "title": "四年级下册科学知识图谱",
            "grade": "四年级",
            "semester": "下册",
            "order": 4,
            "file": "四年级下科学.md",
            "stage": "科学课标3～4年级",
            "domains": [
                (
                    "植物的生长变化",
                    "生命科学：植物",
                    2,
                    "S4D-STD-PLANT",
                    [
                        (2, "种子里孕育着新生命"),
                        (4, "种植凤仙花"),
                        (7, "种子长出了根"),
                        (10, "茎和叶"),
                        (13, "凤仙花开花了"),
                        (15, "果实和种子"),
                        (17, "种子的传播"),
                        (19, "凤仙花的一生"),
                    ],
                ),
                (
                    "电路",
                    "物质科学：电路",
                    22,
                    "S4D-STD-ELEC",
                    [
                        (22, "电和我们的生活"),
                        (24, "点亮小灯泡"),
                        (26, "简易电路"),
                        (29, "电路出故障了"),
                        (31, "里面是怎样连接的"),
                        (33, "导体和绝缘体"),
                        (36, "电路中的开关"),
                        (39, "模拟安装照明电路"),
                    ],
                ),
                (
                    "岩石与土壤",
                    "地球系统：岩石与土壤",
                    42,
                    "S4D-STD-SOIL",
                    [
                        (42, "岩石与土壤的故事"),
                        (44, "认识几种常见的岩石"),
                        (47, "岩石的组成", "extension"),
                        (50, "制作岩石和矿物标本", "extension"),
                        (52, "岩石、沙和黏土"),
                        (54, "观察土壤"),
                        (56, "比较不同的土壤"),
                        (58, "岩石、土壤和我们"),
                    ],
                ),
            ],
            "standards": [
                ("S4D-STD-PLANT", "描述植物由根、茎、叶、花、果实和种子构成，说出植物通过种子或根茎叶繁殖"),
                ("S4D-STD-ELEC", "知道电源、导线、用电器和开关是构成电路的必要元件，区分导体和绝缘体"),
                ("S4D-STD-SOIL", "知道土壤的主要成分，观察并描述砂质土、黏质土、壤质土的特点"),
            ],
            "later": [
                ("S4D-LATER-SOUND", "本册未学：声音的产生、传播、高低和强弱"),
                ("S4D-LATER-WEA", "本册未学：用仪器测量气温、风力、风向和降水量"),
            ],
            "cross": "岩石由矿物组成超出 3～4 年级最低要求，对应 5～6 年级岩石与矿物，因此标为 extension。",
        },
        {
            "id": "S5D",
            "title": "五年级下册科学知识图谱",
            "grade": "五年级",
            "semester": "下册",
            "order": 4,
            "file": "五年级下科学.md",
            "stage": "科学课标5～6年级",
            "domains": [
                (
                    "生物与环境",
                    "生命科学：生物与环境",
                    2,
                    "S5D-STD-ENVBIO",
                    [
                        (2, "种子发芽实验"),
                        (4, "比较种子发芽实验"),
                        (6, "绿豆苗的生长"),
                        (8, "蚯蚓的选择"),
                        (11, "当环境改变了"),
                        (13, "食物链和食物网", "extension"),
                        (17, "设计和制作生态瓶", "extension"),
                    ],
                ),
                (
                    "船的研究",
                    "技术与工程：船",
                    21,
                    "S5D-STD-BOAT",
                    [
                        (21, "船的历史"),
                        (24, "用浮的材料造船"),
                        (26, "用沉的材料造船"),
                        (29, "增加船的载重量"),
                        (31, "给船装上动力"),
                        (33, "设计我们的小船"),
                        (35, "制作与测试我们的小船"),
                    ],
                ),
                (
                    "环境与我们",
                    "地球与环境：资源与环境",
                    39,
                    "S5D-STD-EARTH",
                    [
                        (39, "地球——宇宙的奇迹"),
                        (41, "我们面临的环境问题"),
                        (43, "珍惜水资源"),
                        (46, "解决垃圾问题"),
                        (49, "合理利用能源"),
                        (52, "让资源再生"),
                        (54, "分析一个实际的环境问题"),
                    ],
                ),
                (
                    "热",
                    "物质科学：热传递",
                    58,
                    "S5D-STD-HEAT",
                    [
                        (58, "温度与水的变化"),
                        (61, "水的蒸发和凝结"),
                        (63, "温度不同的物体相互接触"),
                        (65, "热在金属中的传递"),
                        (68, "热在水中的传递"),
                        (70, "哪个传热快"),
                        (73, "做个保温杯"),
                    ],
                ),
            ],
            "standards": [
                ("S5D-STD-ENVBIO", "举例说出动物在环境变化时的行为；知道植物利用阳光、空气和水分制造养分"),
                ("S5D-STD-BOAT", "观察常见材料在水中的沉浮，知道工程以科学和技术为基础"),
                ("S5D-STD-EARTH", "区分可再生资源和不可再生资源，说明人类活动对环境的影响"),
                ("S5D-STD-HEAT", "热从温度高的物体传向温度低的物体，举例说明影响热传递的主要因素"),
            ],
            "later": [
                ("S5D-LATER-CELL", "本册未学：细胞和微生物"),
                ("S5D-LATER-ORBIT", "本册未学：地球自转、公转和月相"),
                ("S5D-LATER-ROCK", "本册未学：岩石由矿物组成，火山和地震"),
            ],
            "cross": "食物链和食物网在 7～9 年级才系统要求物质和能量沿食物链流动，本册标为 extension。总图把珍惜水资源、环境问题连到数学节水方案和语文《只有一个地球》。",
        },
        {
            "id": "S6U",
            "title": "六年级上册科学知识图谱",
            "grade": "六年级",
            "semester": "上册",
            "order": 5,
            "file": "六年级上科学.md",
            "stage": "科学课标5～6年级",
            "domains": [
                (
                    "微小世界",
                    "生命科学：细胞与微生物",
                    2,
                    "S6U-STD-CELL",
                    [
                        (2, "放大镜"),
                        (4, "怎样放得更大"),
                        (6, "观察身边微小的物体"),
                        (9, "观察洋葱表皮细胞"),
                        (11, "观察更多的生物细胞"),
                        (14, "观察水中微小的生物"),
                        (17, "微生物与健康"),
                    ],
                ),
                (
                    "地球的运动",
                    "地球与宇宙：地球的运动",
                    21,
                    "S6U-STD-EARTH",
                    [
                        (21, "我们的地球模型"),
                        (24, "昼夜交替现象"),
                        (26, "人类认识地球运动的历史"),
                        (29, "谁先迎来黎明"),
                        (31, "影长的四季变化"),
                        (33, "地球的公转与四季变化"),
                        (36, "昼夜和四季变化对生物的影响"),
                    ],
                ),
                (
                    "工具与技术",
                    "技术与工程：简单机械",
                    40,
                    "S6U-STD-TOOL",
                    [
                        (40, "紧密联系的工具和技术"),
                        (43, "斜面"),
                        (46, "不简单的杠杆"),
                        (49, "改变运输的车轮"),
                        (52, "灵活巧妙的剪刀"),
                        (54, "推动社会发展的印刷术"),
                        (56, "信息的交流传播"),
                    ],
                ),
                (
                    "能量",
                    "物质科学：能量",
                    59,
                    "S6U-STD-ENERGY",
                    [
                        (59, "各种形式的能量"),
                        (61, "调查家中使用的能量"),
                        (64, "电和磁"),
                        (67, "电能和磁能"),
                        (70, "电磁铁", "partial"),
                        (72, "神奇的小电动机", "partial"),
                        (74, "能量从哪里来"),
                    ],
                ),
            ],
            "standards": [
                ("S6U-STD-CELL", "知道细胞是生物体结构与生命活动的基本单位，列举常见微生物"),
                ("S6U-STD-EARTH", "知道地球自转与昼夜交替有关，地球公转与四季形成有关"),
                ("S6U-STD-TOOL", "知道杠杆、滑轮、轮轴、斜面等简单机械及其应用"),
                ("S6U-STD-ENERGY", "知道动能、声能、光能、热能、电能、磁能等能的形式及其转化"),
            ],
            "later": [
                ("S6U-LATER-UNI", "本册未学：太阳系八颗行星和星座"),
                ("S6U-LATER-CHEM", "本册未学：有些变化会生成新物质"),
            ],
            "cross": "总图把「改变运输的车轮」和数学「车轮为什么是圆的」相连。",
        },
        {
            "id": "S6D",
            "title": "六年级下册科学知识图谱",
            "grade": "六年级",
            "semester": "下册",
            "order": 6,
            "file": "六年级下科学.md",
            "stage": "科学课标5～6年级",
            "domains": [
                (
                    "小小工程师",
                    "技术与工程：工程",
                    2,
                    "S6D-STD-ENG",
                    [
                        (2, "了解我们的住房"),
                        (4, "认识工程"),
                        (8, "建造塔台"),
                        (10, "设计塔台模型"),
                        (13, "制作塔台模型"),
                        (15, "测试塔台模型"),
                        (17, "评估改进塔台模型"),
                    ],
                ),
                (
                    "生物的多样性",
                    "生命科学：生物多样性",
                    20,
                    "S6D-STD-BIO",
                    [
                        (20, "校园生物大搜索"),
                        (23, "制作校园生物分布图"),
                        (26, "形形色色的植物"),
                        (29, "多种多样的动物"),
                        (32, "相貌各异的我们"),
                        (34, "古代生物的多样性"),
                        (36, "保护生物多样性"),
                    ],
                ),
                (
                    "宇宙",
                    "地球与宇宙：太阳系与星空",
                    40,
                    "S6D-STD-UNI",
                    [
                        (40, "太阳系大家庭"),
                        (43, "八颗行星"),
                        (45, "日食"),
                        (47, "认识星座"),
                        (49, "夏季星空"),
                        (51, "浩瀚的宇宙"),
                        (54, "探索宇宙"),
                    ],
                ),
                (
                    "物质的变化",
                    "物质科学：物质变化",
                    58,
                    "S6D-STD-CHG",
                    [
                        (58, "厨房里的物质与变化"),
                        (61, "产生气体的变化"),
                        (63, "发现变化中的新物质"),
                        (66, "变化中伴随的现象"),
                        (68, "地球家园的化学变化"),
                        (71, "生命体中的化学变化"),
                        (73, "美丽的化学变化"),
                    ],
                ),
            ],
            "standards": [
                ("S6D-STD-ENG", "知道工程以科学和技术为基础，通常由多个系统组成"),
                ("S6D-STD-BIO", "根据特征对植物分类；根据化石说出已灭绝生物，并关注生物多样性保护"),
                ("S6D-STD-UNI", "知道太阳是恒星、太阳系有八颗行星，认识大熊座、猎户座等星座"),
                ("S6D-STD-CHG", "知道有些变化中构成物体的物质也发生了改变，如纸燃烧、铁生锈"),
            ],
            "later": [
                ("S6D-LATER-CELL", "本册未学：用显微镜观察细胞"),
                ("S6D-LATER-SEASON", "本册未学：地球公转与四季"),
            ],
            "cross": "总图把「探索宇宙」和六年级语文《宇宙生命之谜》相连。",
        },
    ]

    for spec in specs:
        g = Graph(
            meta_for(
                spec["title"],
                spec["grade"],
                spec["semester"],
                ["科学"],
                spec["file"],
                "教育科学出版社义务教育教科书",
                SCI_STD,
                "课次与目录、正文课题一致。对齐状态按该册所在学段的内容要求判断。",
                SCI_LIMIT,
                spec["cross"],
            )
        )
        g.add(
            spec["id"],
            "subject",
            spec["title"].replace("知识图谱", ""),
            order=spec["order"],
            source=f"{spec['file']}封面｜教育科学出版社",
        )
        finalize_shared(
            g,
            spec["id"],
            {
                "methods": [
                    {
                        "id": f"{spec['id']}-M-OBS",
                        "name": "观察并记录",
                        "source": f"{spec['stage']}学习活动：观察、测量、实验",
                    },
                    {
                        "id": f"{spec['id']}-M-EXP",
                        "name": "实验探究",
                        "source": f"{spec['stage']}学习活动：实验探究",
                    },
                    {
                        "id": f"{spec['id']}-M-MAKE",
                        "name": "设计与制作",
                        "source": f"{spec['stage']}学习活动：制作",
                    },
                ],
                "standards": [
                    {"id": sid, "name": name, "source": spec["stage"]}
                    for sid, name in spec["standards"]
                ],
                "competencies": [
                    {
                        "id": f"{spec['id']}-C-IDEA",
                        "name": "科学观念",
                        "source": "科学课标核心素养：科学观念",
                    },
                    {
                        "id": f"{spec['id']}-C-THINK",
                        "name": "科学思维",
                        "source": "科学课标核心素养：科学思维",
                    },
                    {
                        "id": f"{spec['id']}-C-INQ",
                        "name": "探究实践",
                        "source": "科学课标核心素养：探究实践",
                    },
                    {
                        "id": f"{spec['id']}-C-ATT",
                        "name": "态度责任",
                        "source": "科学课标核心素养：态度责任",
                    },
                ],
                "later": [
                    {"id": sid, "name": name, "source": spec["stage"]}
                    for sid, name in spec["later"]
                ],
            },
        )
        domains = []
        for unit_name, domain_name, page, standard, lessons in spec["domains"]:
            slug = standard.split("-")[-1]
            prefix = f"{spec['id']}-U-{slug}"
            built = []
            for index, item in enumerate(lessons, start=1):
                if len(item) == 3:
                    lesson_page, lesson_name, alignment = item
                else:
                    lesson_page, lesson_name = item
                    alignment = "direct"
                built.append(lesson(prefix, index, lesson_page, lesson_name, standard, alignment))
            domains.append(
                {
                    "id": f"{spec['id']}-D-{slug}",
                    "name": domain_name,
                    "units": [
                        {
                            "id": prefix,
                            "name": unit_name,
                            "page": page,
                            "methods": [
                                f"{spec['id']}-M-OBS",
                                f"{spec['id']}-M-EXP",
                            ],
                            "lessons": built,
                        }
                    ],
                }
            )
        add_tree(g, spec["id"], domains, spec["file"])
        books.append(g)
    return books


def build_chinese() -> list[Graph]:
    books = []
    specs = [
        {
            "id": "C4",
            "title": "四年级上册语文知识图谱",
            "grade": "四年级",
            "semester": "上册",
            "order": 3,
            "file": "四年级上语文.md",
            "standards": [
                {"id": "C4-STD-ASK", "name": "能对课文中不理解的地方提出疑问，学习圈点、批注", "where": "第二学段（3～4年级）阅读与鉴赏3"},
                {"id": "C4-STD-IMAGE", "name": "诵读优秀诗文，展开想象，领悟诗文大意，初步感受生动的形象和优美的语言", "where": "第二学段（3～4年级）阅读与鉴赏4"},
                {"id": "C4-STD-WRITE", "name": "观察周围世界，把见闻、感受和想象写清楚", "where": "第二学段（3～4年级）表达与交流4"},
                {"id": "C4-STD-LETTER", "name": "能用便条、简短的书信等进行交流", "where": "第二学段（3～4年级）表达与交流4"},
                {"id": "C4-STD-SPEAK", "name": "能清楚明白地讲述见闻，说出自己的感受和想法", "where": "第二学段（3～4年级）表达与交流3"},
                {"id": "C4-STD-OBS", "name": "学习阅读说明、叙写大自然的短文，用日记、观察手记展示观察收获", "where": "第二学段（3～4年级）实用性阅读与交流（2）"},
                {"id": "C4-STD-MYTH", "name": "阅读中国古今寓言、中国神话传说，学习其中蕴含的中华智慧", "where": "第二学段（3～4年级）整本书阅读（3）"},
                {"id": "C4-STD-CULTURE", "name": "初步认识中华优秀传统文化蕴含的思想和智慧", "where": "第二学段（3～4年级）学段要求落实段"},
                {"id": "C4-STD-HERO", "name": "阅读并讲述革命故事、爱国故事、历史人物故事", "where": "第二学段（3～4年级）文学阅读与创意表达（1）"},
                {"id": "C4-STD-SCI", "name": "阅读有关科学的短文，表达自己的观点和思考", "where": "第二学段（3～4年级）思辨性阅读与表达（1）"},
            ],
            "later": [
                {"id": "C4-LATER-COUNT", "name": "本册未单列完成：累计认识常用汉字2500个左右，其中1600个左右会写", "where": "第二学段（3～4年级）识字与写字1"},
                {"id": "C4-LATER-DICT", "name": "本册未系统教学：能用音序检字法和部首检字法查字典、词典", "where": "第二学段（3～4年级）识字与写字1"},
                {"id": "C4-LATER-BRUSH", "name": "本册未系统教学：用毛笔临摹正楷字帖", "where": "第二学段（3～4年级）识字与写字2"},
                {"id": "C4-LATER-SKIM", "name": "本册未系统教学：学习略读，粗知文章大意", "where": "第二学段（3～4年级）阅读与鉴赏1"},
                {"id": "C4-LATER-RETELL", "name": "本册未系统教学：能复述叙事性作品的大意", "where": "第二学段（3～4年级）阅读与鉴赏4"},
                {"id": "C4-LATER-BOOK", "name": "本册未完成学段整本书要求：阅读整本书，初步理解主要内容", "where": "第二学段（3～4年级）阅读与鉴赏5"},
                {"id": "C4-LATER-VOLUME", "name": "本册未核验：课外阅读总量不少于40万字", "where": "第二学段（3～4年级）阅读与鉴赏6"},
                {"id": "C4-LATER-REVISE", "name": "本册未系统教学：学习修改习作中有明显错误的词句", "where": "第二学段（3～4年级）表达与交流5"},
                {"id": "C4-LATER-SORT", "name": "本册未系统教学：尝试分类整理学过的字词", "where": "第二学段（3～4年级）梳理与探究1"},
            ],
            "units": [
                ("自然与想象", 1, [("观潮", 2), ("繁星", 5), ("现代诗二首", 7, "C4-STD-IMAGE", "partial"), ("口语交际：我们与环境", 9), ("习作：推荐一个好地方", 10)], [("边读边想象画面，感受自然之美", 1, "C4-STD-IMAGE", "partial"), ("推荐一个好地方，写清楚推荐理由", 10, "C4-STD-WRITE", "partial")]),
                ("提问阅读", 13, [("一个豆荚里的五粒豆", 14), ("夜间飞行的秘密", 19, "C4-STD-SCI", "partial"), ("呼风唤雨的世纪", 23, "C4-STD-SCI", "partial"), ("田忌赛马", 26), ("习作：小小动物园", 28)], [("阅读时把遇到的问题写下来", 13, "C4-STD-ASK", "direct")]),
                ("连续观察", 31, [("古诗三首", 32), ("爬山虎的脚", 34), ("蟋蟀的住宅", 37), ("习作：写观察日记", 42, "C4-STD-OBS", "direct")], [("体会文章准确生动的表达，感受作者连续细致的观察", 31, "C4-STD-OBS", "direct")]),
                ("神话", 45, [("盘古开天地", 46, "C4-STD-MYTH", "partial"), ("精卫填海", 48, "C4-STD-MYTH", "partial"), ("普罗米修斯", 49, "C4-STD-MYTH", "partial"), ("女娲补天", 52, "C4-STD-MYTH", "partial"), ("快乐读书吧：很久很久以前", 57, "C4-STD-MYTH", "partial")], []),
                ("把事情写清楚", 59, [("麻雀", 60), ("爬天都峰", 63), ("习作：生活万花筒", 70)], [("了解作者是怎样把事情写清楚的", 59, "C4-STD-WRITE", "partial"), ("写一件事，把事情写清楚", 70, "C4-STD-WRITE", "direct")]),
                ("中华文化", 71, [("长城", 72, "C4-STD-CULTURE", "partial"), ("颐和园", 75, "C4-STD-CULTURE", "partial"), ("秦兵马俑", 78, "C4-STD-CULTURE", "partial"), ("口语交际：我是小小讲解员", 80, "C4-STD-SPEAK", "partial"), ("习作：中国的世界文化遗产", 81, "C4-STD-CULTURE", "partial")], []),
                ("感受与批注", 85, [("牛和鹅", 86), ("一只窝囊的大老虎", 91), ("王戎不取道旁李", 96), ("陀螺", 97), ("习作：我的心儿怦怦跳", 102)], [("学习用批注的方法阅读", 85, "C4-STD-ASK", "direct"), ("写一件事，能写出自己的感受", 102, "C4-STD-WRITE", "direct")]),
                ("家国情怀", 105, [("古诗三首", 106, "C4-STD-IMAGE", "partial"), ("为中华之崛起而读书", 108, "C4-STD-HERO", "partial"), ("梅兰芳蓄须明志", 111, "C4-STD-HERO", "partial"), ("延安，我把你追寻", 116, "C4-STD-HERO", "partial"), ("习作：写信", 118, "C4-STD-LETTER", "direct")], []),
            ],
        },
        {
            "id": "C5",
            "title": "五年级上册语文知识图谱",
            "grade": "五年级",
            "semester": "上册",
            "order": 4,
            "file": "五年级上语文.md",
            "standards": [
                {"id": "C5-STD-FEEL", "name": "在阅读中了解文章的表达顺序，体会作者的思想感情，初步领悟文章的基本表达方法", "where": "第三学段（5～6年级）阅读与鉴赏3"},
                {"id": "C5-STD-SPEED", "name": "默读有一定的速度，学习浏览，根据需要搜集信息", "where": "第三学段（5～6年级）阅读与鉴赏1"},
                {"id": "C5-STD-EXPLAIN", "name": "阅读说明性文章，能抓住要点，了解文章的基本说明方法", "where": "第三学段（5～6年级）阅读与鉴赏5"},
                {"id": "C5-STD-POEM", "name": "阅读诗歌，大体把握诗意，想象诗歌描述的情境，体会作品的情感", "where": "第三学段（5～6年级）阅读与鉴赏4"},
                {"id": "C5-STD-STORY", "name": "复述印象深刻的故事情节，尝试富有创意地表达", "where": "第三学段（5～6年级）文学阅读与创意表达（3）"},
                {"id": "C5-STD-DATA", "name": "初步了解查找资料、运用资料的基本方法", "where": "第三学段（5～6年级）梳理与探究3"},
                {"id": "C5-STD-OUTLINE", "name": "学习记笔记、列大纲等整理和呈现信息的方法", "where": "第三学段（5～6年级）实用性阅读与交流（2）"},
                {"id": "C5-STD-NOTE", "name": "学写读书笔记", "where": "第三学段（5～6年级）表达与交流4"},
                {"id": "C5-STD-LOVE", "name": "感悟老一辈无产阶级革命家的英雄气概，体会捍卫民族尊严的伟大精神", "where": "第三学段（5～6年级）学段要求落实段"},
                {"id": "C5-STD-FAMILY", "name": "阅读记人叙事的优秀文本，交流身边令人感动、难忘的人和事", "where": "第三学段（5～6年级）实用性阅读与交流（1）"},
                {"id": "C5-STD-NATURE", "name": "阅读表现人与自然的诗歌、散文，体会人与自然和谐相处的意义", "where": "第三学段（5～6年级）文学阅读与创意表达（2）"},
                {"id": "C5-STD-SCI", "name": "阅读有关科学发现、技术发明的故事", "where": "第三学段（5～6年级）思辨性阅读与表达（3）"},
                {"id": "C5-STD-WHOLE", "name": "阅读整本书，把握文本的主要内容，积极向同学推荐并说明理由", "where": "第三学段（5～6年级）阅读与鉴赏6"},
            ],
            "later": [
                {"id": "C5-LATER-COUNT", "name": "本册未单列完成：累计认识常用汉字3000个左右，其中2500个左右会写", "where": "第三学段（5～6年级）识字与写字1"},
                {"id": "C5-LATER-BRUSH", "name": "本册未系统教学：能用毛笔书写楷书", "where": "第三学段（5～6年级）识字与写字2"},
                {"id": "C5-LATER-RATE", "name": "本册未核验：默读一般读物每分钟不少于300字", "where": "第三学段（5～6年级）阅读与鉴赏1"},
                {"id": "C5-LATER-TONE", "name": "本册未系统教学：辨别词语的感情色彩", "where": "第三学段（5～6年级）阅读与鉴赏2"},
                {"id": "C5-LATER-PUNCT", "name": "本册未系统教学：体会顿号与逗号、分号与句号的不同用法", "where": "第三学段（5～6年级）阅读与鉴赏2"},
                {"id": "C5-LATER-NONLIN", "name": "本册未系统教学：阅读简单的非连续性文本", "where": "第三学段（5～6年级）阅读与鉴赏5"},
                {"id": "C5-LATER-VOLUME", "name": "本册未核验：课外阅读总量不少于100万字", "where": "第三学段（5～6年级）阅读与鉴赏7"},
                {"id": "C5-LATER-REVISE", "name": "本册未系统教学：修改自己的习作，并主动与他人交换修改", "where": "第三学段（5～6年级）表达与交流5"},
                {"id": "C5-LATER-REPORT", "name": "本册未系统教学：尝试写简单的研究报告", "where": "第三学段（5～6年级）梳理与探究3"},
                {"id": "C5-LATER-PLAN", "name": "本册未系统教学：学写活动计划和活动总结", "where": "第三学段（5～6年级）梳理与探究4"},
                {"id": "C5-LATER-SORT", "name": "本册未系统教学：分类整理学过的字词", "where": "第三学段（5～6年级）梳理与探究1"},
            ],
            "units": [
                ("借物抒情", 1, [("桂花雨", 2), ("落花生", 5), ("珍珠鸟", 7), ("口语交际：制定班级公约", 9), ("习作：我的心爱之物", 10)], [("体会课文借助具体事物表达的思想感情", 1, "C5-STD-FEEL", "partial")]),
                ("提高阅读速度", 13, [("冀中的地道战", 14), ("将相和", 17), ("什么比猎豹的速度更快", 22, "C5-STD-SCI", "partial"), ("诺曼底号遇难记", 25), ("习作：漫画老师", 30)], [("学习提高阅读速度的方法", 13, "C5-STD-SPEED", "partial")]),
                ("民间故事", 33, [("猎人海力布", 34, "C5-STD-STORY", "partial"), ("牛郎织女（一）", 37, "C5-STD-STORY", "partial"), ("牛郎织女（二）", 42, "C5-STD-STORY", "partial"), ("习作：故事新编", 46, "C5-STD-STORY", "partial"), ("快乐读书吧：从前有座山", 49, "C5-STD-WHOLE", "partial")], [("民间故事是口耳相传的经典", 33, "C5-STD-STORY", "partial")]),
                ("爱国情怀", 51, [("古诗三首", 52, "C5-STD-POEM", "partial"), ("少年中国说（节选）", 54, "C5-STD-LOVE", "partial"), ("圆明园的毁灭", 56, "C5-STD-LOVE", "partial"), ("彩色的翅膀", 59, "C5-STD-LOVE", "partial"), ("梅兰芳蓄须明志", 62, "C5-STD-LOVE", "partial"), ("习作：二十年后的家乡", 65)], [("结合资料，深入体会课文表达的思想感情", 51, "C5-STD-DATA", "partial"), ("学习列提纲", 65, "C5-STD-OUTLINE", "direct")]),
                ("说明文", 68, [("太阳", 69, "C5-STD-EXPLAIN", "partial"), ("金字塔", 71, "C5-STD-EXPLAIN", "partial"), ("习作：介绍一种事物", 74)], [("说明文以说明白了为成功", 68, "C5-STD-EXPLAIN", "partial")]),
                ("父母之爱", 78, [("慈母情深", 79, "C5-STD-FAMILY", "partial"), ("父爱之舟", 83, "C5-STD-FAMILY", "partial"), ("航天员写给孩子的信", 87, "C5-STD-FAMILY", "partial"), ("口语交际：父母之爱", 90, "C5-STD-FAMILY", "partial"), ("习作：我想对您说", 91, "C5-STD-FAMILY", "partial")], []),
                ("四时景物", 94, [("古诗三首", 95, "C5-STD-NATURE", "partial"), ("第一场雪", 97, "C5-STD-NATURE", "partial"), ("白鹭", 99, "C5-STD-NATURE", "partial"), ("习作：即景", 101, "C5-STD-NATURE", "partial")], []),
                ("读书", 104, [("古人谈读书", 105, "C5-STD-WHOLE", "partial"), ("忆读书", 107, "C5-STD-WHOLE", "partial"), ("走遍天下书为侣", 112, "C5-STD-WHOLE", "partial"), ("习作：写读后感", 114, "C5-STD-NOTE", "partial")], []),
            ],
        },
        {
            "id": "C6",
            "title": "六年级上册语文知识图谱",
            "grade": "六年级",
            "semester": "上册",
            "order": 5,
            "file": "六年级上语文.md",
            "standards": [
                {"id": "C6-STD-NATURE", "name": "阅读表现人与自然的诗歌、散文，体会人与自然和谐相处的意义", "where": "第三学段（5～6年级）文学阅读与创意表达（2）"},
                {"id": "C6-STD-JUDGE", "name": "在交流和讨论中，敢于提出看法，作出自己的判断", "where": "第三学段（5～6年级）阅读与鉴赏3"},
                {"id": "C6-STD-REV", "name": "阅读表现革命先烈事迹的诗歌、小说，感受革命先烈伟大的精神世界", "where": "第三学段（5～6年级）文学阅读与创意表达（1）"},
                {"id": "C6-STD-SPEAK", "name": "能根据对象和场合，稍作准备，作简单的发言", "where": "第三学段（5～6年级）表达与交流2"},
                {"id": "C6-STD-METHOD", "name": "初步领悟文章的基本表达方法", "where": "第三学段（5～6年级）阅读与鉴赏3"},
                {"id": "C6-STD-PURPOSE", "name": "学习浏览，根据需要搜集信息", "where": "第三学段（5～6年级）阅读与鉴赏1"},
                {"id": "C6-STD-SCI", "name": "阅读有关科学发现、技术发明的故事", "where": "第三学段（5～6年级）思辨性阅读与表达（3）"},
                {"id": "C6-STD-NOVEL", "name": "阅读叙事性作品，了解事件梗概，能简单描述印象最深的场景、人物、细节", "where": "第三学段（5～6年级）阅读与鉴赏4"},
                {"id": "C6-STD-STORY", "name": "复述印象深刻的故事情节，尝试富有创意地表达", "where": "第三学段（5～6年级）文学阅读与创意表达（3）"},
                {"id": "C6-STD-WRITE", "name": "能写简单的记实作文，内容具体，感情真实，分段表述", "where": "第三学段（5～6年级）表达与交流4"},
                {"id": "C6-STD-IMAGINE", "name": "能写简单的想象作文", "where": "第三学段（5～6年级）表达与交流4"},
                {"id": "C6-STD-APP", "name": "学写常见应用文", "where": "第三学段（5～6年级）表达与交流4"},
                {"id": "C6-STD-TOPIC", "name": "对自己身边的、大家共同关注的问题开展专题探究", "where": "第三学段（5～6年级）梳理与探究4"},
                {"id": "C6-STD-GROW", "name": "阅读反映少年成长的故事、小说、传记，交流自己获得的启示", "where": "第三学段（5～6年级）文学阅读与创意表达（4）"},
                {"id": "C6-STD-WHOLE", "name": "梳理、反思小学阶段的阅读生活，分享整本书阅读的经历和体会", "where": "第三学段（5～6年级）整本书阅读（3）"},
                {"id": "C6-STD-CLASSIC", "name": "学习短小的文言经典，理解作者的立场、观点与方法", "where": "第四学段（7～9年级）思辨性阅读与表达（4）"},
            ],
            "later": [
                {"id": "C6-LATER-COUNT", "name": "本册未单列完成：累计认识常用汉字3000个左右，其中2500个左右会写", "where": "第三学段（5～6年级）识字与写字1"},
                {"id": "C6-LATER-BRUSH", "name": "本册未系统教学：能用毛笔书写楷书", "where": "第三学段（5～6年级）识字与写字2"},
                {"id": "C6-LATER-RATE", "name": "本册未核验：默读一般读物每分钟不少于300字", "where": "第三学段（5～6年级）阅读与鉴赏1"},
                {"id": "C6-LATER-TONE", "name": "本册未系统教学：辨别词语的感情色彩", "where": "第三学段（5～6年级）阅读与鉴赏2"},
                {"id": "C6-LATER-PUNCT", "name": "本册未系统教学：体会顿号与逗号、分号与句号的不同用法", "where": "第三学段（5～6年级）阅读与鉴赏2"},
                {"id": "C6-LATER-NONLIN", "name": "本册未系统教学：阅读简单的非连续性文本", "where": "第三学段（5～6年级）阅读与鉴赏5"},
                {"id": "C6-LATER-VOLUME", "name": "本册未核验：课外阅读总量不少于100万字", "where": "第三学段（5～6年级）阅读与鉴赏7"},
                {"id": "C6-LATER-REVISE", "name": "本册未系统教学：修改自己的习作，并主动与他人交换修改", "where": "第三学段（5～6年级）表达与交流5"},
                {"id": "C6-LATER-REPORT", "name": "本册未系统教学：尝试写简单的研究报告", "where": "第三学段（5～6年级）梳理与探究3"},
                {"id": "C6-LATER-PLAN", "name": "本册未系统教学：学写活动计划和活动总结", "where": "第三学段（5～6年级）梳理与探究4"},
                {"id": "C6-LATER-SORT", "name": "本册未系统教学：分类整理学过的字词", "where": "第三学段（5～6年级）梳理与探究1"},
            ],
            "units": [
                ("亲近自然", 1, [("草原", 2, "C6-STD-NATURE", "partial"), ("丁香结", 5, "C6-STD-NATURE", "partial"), ("古诗词三首", 8, "C6-STD-NATURE", "partial"), ("习作：变形记", 10)], [("亲近自然，热爱生活", 1, "C6-STD-NATURE", "partial"), ("从所读的内容想开去", 1, "C6-STD-JUDGE", "partial")]),
                ("革命岁月", 13, [("七律·长征", 14, "C6-STD-REV", "partial"), ("狼牙山五壮士", 16, "C6-STD-REV", "partial"), ("开国大典", 19, "C6-STD-REV", "partial"), ("我的战友邱少云", 24, "C6-STD-REV", "partial"), ("口语交际：演讲", 27, "C6-STD-SPEAK", "partial"), ("习作：多彩的活动", 28)], [("体会革命前辈为理想奋斗的精神", 13, "C6-STD-REV", "direct"), ("了解文章怎样点面结合写场面", 28, "C6-STD-METHOD", "partial")]),
                ("有目的地阅读", 31, [("竹节人", 32), ("宇宙生命之谜", 36, "C6-STD-SCI", "partial"), ("故宫博物院", 40), ("习作：让生活更美好", 46)], [("根据阅读目的，选用恰当的阅读方法", 31, "C6-STD-PURPOSE", "partial")]),
                ("小说", 49, [("桥", 50, "C6-STD-NOVEL", "partial"), ("穷人", 53, "C6-STD-NOVEL", "partial"), ("金色的鱼钩", 58, "C6-STD-NOVEL", "partial"), ("习作：笔尖流出的故事", 64, "C6-STD-STORY", "partial"), ("快乐读书吧：笑与泪，经历与成长", 67, "C6-STD-WHOLE", "partial")], [("关注小说中的情节、环境，感受人物形象", 49, "C6-STD-NOVEL", "partial")]),
                ("围绕中心意思写", 69, [("灯光", 70), ("盼", 73), ("习作：围绕中心意思写", 77)], [("围绕中心意思写", 77, "C6-STD-WRITE", "partial")]),
                ("人与自然", 81, [("只有一个地球", 82, "C6-STD-TOPIC", "partial"), ("青山不老", 84, "C6-STD-NATURE", "partial"), ("三黑和土地", 86, "C6-STD-NATURE", "partial"), ("古诗三首", 91, "C6-STD-NATURE", "partial"), ("习作：学写倡议书", 94, "C6-STD-APP", "partial")], []),
                ("科学与想象", 97, [("文言文二则", 98, "C6-STD-CLASSIC", "extension"), ("表里的生物", 100), ("他们那时候多有趣啊", 103), ("习作：插上科学的翅膀飞", 106)], [("综合运用多种方法，把握文章的主要内容", 97, "C6-STD-METHOD", "partial"), ("展开想象，试着写科幻故事", 106, "C6-STD-IMAGINE", "partial")]),
                ("初识鲁迅", 109, [("少年闰土", 110, "C6-STD-GROW", "partial"), ("好的故事", 114, "C6-STD-GROW", "partial"), ("我的伯父鲁迅先生", 117, "C6-STD-GROW", "partial"), ("有的人", 121), ("习作：传承好家风", 123)], [("初识鲁迅，感受鲁迅的魅力", 109, "C6-STD-GROW", "partial")]),
            ],
        },
    ]
    for spec in specs:
        g = Graph(
            meta_for(
                spec["title"],
                spec["grade"],
                spec["semester"],
                ["语文"],
                spec["file"],
                "人民教育出版社义务教育教科书",
                CHI_STD,
                "按本册所在学段对齐。学段里本册尚未系统完成的要求标为 stage_later。",
                CHI_LIMIT,
                "跨学科边只在总图中建立，且只连接教材内容确实相关的课。",
            )
        )
        g.add(spec["id"], "subject", spec["title"].replace("知识图谱", ""), order=spec["order"], source=f"{spec['file']}封面｜人民教育出版社")
        for item in spec["standards"]:
            g.add(item["id"], "standard", item["name"], status=item.get("status", "stage_standard"), source=f"{CHI_STD}｜{item['where']}")
            g.edge(spec["id"], "contains", item["id"])
        for item in spec["later"]:
            g.add(item["id"], "standard", item["name"], status="stage_later", source=f"{CHI_STD}｜{item['where']}")
            g.edge(spec["id"], "contains", item["id"])
        for key, name in (("CUL", "文化自信"), ("LANG", "语言运用"), ("THINK", "思维能力"), ("AES", "审美创造")):
            cid = f"{spec['id']}-C-{key}"
            g.add(cid, "competency", name, source=f"{CHI_STD}｜核心素养内涵：{name}")
            g.edge(spec["id"], "develops", cid)
        g.add(f"{spec['id']}-D-READ", "domain", "阅读与表达")
        g.edge(spec["id"], "contains", f"{spec['id']}-D-READ")
        g.add(
            f"{spec['id']}-M-READ",
            "method",
            "按单元要求朗读、阅读和表达",
            source=src_text(spec["file"], 1, "单元导语中的学习要求"),
        )
        g.edge(spec["id"], "contains", f"{spec['id']}-M-READ")
        for index, (name, page, lessons, goals) in enumerate(spec["units"], start=1):
            uid = f"{spec['id']}-U{index:02d}"
            g.add(uid, "unit", f"第{index}单元 {name}", source=src_text(spec["file"], page, name))
            g.edge(f"{spec['id']}-D-READ", "contains", uid)
            g.edge(uid, "uses_method", f"{spec['id']}-M-READ")
            for lesson_index, lesson in enumerate(lessons, start=1):
                lesson_name, lesson_page = lesson[0], lesson[1]
                lid = f"{uid}-L{lesson_index}"
                g.add(lid, "lesson", lesson_name, source=src_text(spec["file"], lesson_page, lesson_name))
                g.edge(uid, "contains", lid)
                if len(lesson) >= 4:
                    g.edge(lid, "aligns_to", lesson[2], lesson[3])
            for goal_index, goal in enumerate(goals, start=1):
                goal_text, goal_page = goal[0], goal[1]
                kid = f"{uid}-K{goal_index}"
                g.add(kid, "knowledge", goal_text, source=src_text(spec["file"], goal_page, goal_text))
                g.edge(uid, "teaches", kid)
                g.edge(kid, "uses_method", f"{spec['id']}-M-READ")
                if len(goal) >= 4:
                    g.edge(kid, "aligns_to", goal[2], goal[3])
        books.append(g)
    return books


def write_all():
    graphs = [build_math4(), build_math6(), *science_books(), *build_chinese()]
    payloads = []
    for graph in graphs:
        stem = graph.metadata["title"].replace("知识图谱", "")
        payloads.append(dump_book(graph, stem))
        print(f"{stem}: nodes {len(graph.nodes)} edges {len(graph.edges)}")
    return payloads


NEW_PREFIXES = ("M4", "M6", "S4U", "S4D", "S5D", "S6U", "S6D", "C4", "C5", "C6")
NEW_THEMES = {
    "X-SPEED-CHEETAH",
    "X-BAT-SOUND",
    "X-SAVE-WATER",
    "X-NUTRITION",
    "X-WHEEL",
    "X-ONE-EARTH",
    "X-UNIVERSE",
}


def is_new_id(node_id: str) -> bool:
    return node_id in NEW_THEMES or node_id.startswith(NEW_PREFIXES)


def merge(payloads: list[dict]):
    base = json.loads((SRC / "智启知识图谱.json").read_text(encoding="utf-8"))
    nodes = [node for node in base["nodes"] if not is_new_id(node["id"])]
    edges = [
        edge
        for edge in base["edges"]
        if not is_new_id(edge["source"]) and not is_new_id(edge["target"])
    ]
    ids = {node["id"] for node in nodes}
    for payload in payloads:
        for node in payload["nodes"]:
            if node["id"] in ids:
                raise SystemExit(f"id collision with existing graph: {node['id']}")
            nodes.append(node)
            ids.add(node["id"])
        edges.extend(payload["edges"])

    bridges = [
        ("M-K-ANGLE", "prerequisite_of", "M4-K-ANGLE"),
        ("M-K-VIEW", "prerequisite_of", "M4-K-VIEW"),
        ("M4-K-MUL", "prerequisite_of", "M5-K-DMUL"),
        ("M4-K-VIEW", "prerequisite_of", "M6-K-VIEW"),
        ("M-K-DIRECTION", "prerequisite_of", "M6-K-POS"),
        ("M5-K-LET", "prerequisite_of", "M6-K-LET"),
        ("M5-K-DEC-FRAC", "prerequisite_of", "M6-K-DIV1"),
    ]
    for source, relation, target in bridges:
        if source not in ids or target not in ids:
            raise SystemExit(f"missing bridge {source} -> {target}")
        edges.append({"source": source, "relation": relation, "target": target})

    themes = [
        ("X-SPEED-CHEETAH", "速度比较", "四年级", "上册", ["M4-K-SPEED", "C5-U02-L3"]),
        ("X-BAT-SOUND", "声音与夜间飞行", "四年级", "上册", ["S4U-U-SOUND-L4", "C4-U02-L2"]),
        ("X-SAVE-WATER", "节约用水", "六年级", "上册", ["M6-K-WATER", "S5D-U-EARTH-L3"]),
        ("X-NUTRITION", "营养均衡", "六年级", "上册", ["M6-K-FOOD", "S4U-U-BODY-L6"]),
        ("X-WHEEL", "车轮为什么是圆的", "六年级", "上册", ["M6-K-WHYCIR", "S6U-U-TOOL-L4"]),
        ("X-ONE-EARTH", "只有一个地球", "六年级", "上册", ["C6-U06-L1", "S5D-U-EARTH-L2"]),
        ("X-UNIVERSE", "宇宙中的生命", "六年级", "上册", ["C6-U03-L2", "S6D-U-UNI-L7"]),
    ]
    for tid, name, grade, semester, targets in themes:
        if tid in ids:
            raise SystemExit(f"theme exists {tid}")
        for target in targets:
            if target not in ids:
                raise SystemExit(f"missing cross target {target}")
        nodes.append(
            {
                "id": tid,
                "type": "cross_disciplinary_theme",
                "name": name,
                "status": "current_book",
                "grade": grade,
                "semester": semester,
                "source": "教材课次之间的真实任务或相同研究对象",
            }
        )
        ids.add(tid)
        for target in targets:
            edges.append({"source": tid, "relation": "cross_links", "target": target})

    types = Counter(node["type"] for node in nodes)
    books = [
        {"grade": "三年级", "semester": "上册", "subjects": ["数学", "科学"]},
        {"grade": "四年级", "semester": "上册", "subjects": ["数学", "语文"]},
        {"grade": "四年级", "semester": "下册", "subjects": ["科学"]},
        {"grade": "五年级", "semester": "上册", "subjects": ["数学", "科学", "语文"]},
        {"grade": "五年级", "semester": "下册", "subjects": ["科学"]},
        {"grade": "六年级", "semester": "上册", "subjects": ["数学", "科学", "语文"]},
        {"grade": "六年级", "semester": "下册", "subjects": ["科学"]},
    ]
    merged = {
        "metadata": {
            "title": "智启知识图谱",
            "version": "3.1",
            "generated_date": DATE,
            "grade": "三年级、四年级、五年级、六年级",
            "semester": "上册、下册",
            "grades": ["三年级", "四年级", "五年级", "六年级"],
            "subjects": ["数学", "科学", "语文"],
            "scope_note": "总图包含三年级上册和五年级上册的数学、科学，以及新加入的四年级上册数学和语文、四年级下册科学、五年级上册语文、五年级下册科学、六年级上册数学科学语文、六年级下册科学。全部视角按数学、科学、语文分成三块，每一科内部按年级和册次从上到下排列。未传年级时仍默认三年级。status=stage_later 不是本册已经掌握。语文四上对齐第二学段，五上和六上对齐第三学段；本册没有系统完成的学段要求仍是 stage_later。",
            "page_reference": "书内页来自教材目录和课题页。Markdown 教材未提供可靠 PDF 页，不编造 PDF 页码。",
            "source_files": base["metadata"].get("source_files", [])
            + [
                "四年级上数学.md",
                "六年级上数学.md",
                "四年级上科学.md",
                "四年级下科学.md",
                "五年级下科学.md",
                "六年级上科学.md",
                "六年级下科学.md",
                "四年级上语文.md",
                "五年级上语文.md",
                "六年级上语文.md",
                "（3）义务教育语文课程标准日常修订版（2022年版2025年修订）.md",
            ],
            "books": books,
            "node_type_counts": dict(types),
        },
        "node_types": NODE_TYPES,
        "relation_types": RELATIONS,
        "nodes": nodes,
        "edges": edges,
        "node_type_counts": dict(types),
    }
    text = json.dumps(merged, ensure_ascii=False, indent=2) + "\n"
    (SRC / "智启知识图谱.json").write_text(text, encoding="utf-8")
    (PUBLIC / "data.json").write_text(text, encoding="utf-8")
    (PUBLIC / "data.baseline.json").write_text(text, encoding="utf-8")
    update_index(merged, payloads)
    print(f"merged nodes {len(nodes)} edges {len(edges)}")


def update_index(merged: dict, payloads: list[dict]):
    index = json.loads((SRC / "知识图谱索引.json").read_text(encoding="utf-8"))
    counts = Counter(node["type"] for node in merged["nodes"])
    main = {
        "graph_id": "ZHIQI-KG",
        "title": "智启知识图谱",
        "version": "3.1",
        "grade": "三年级、四年级、五年级、六年级",
        "grade_aliases": ["三年级", "四年级", "五年级", "六年级"],
        "semester": "上册、下册",
        "semester_aliases": ["上册", "下册"],
        "subjects": ["数学", "科学", "语文"],
        "files": ["智启知识图谱.json"],
        "source_graph_file": "智启知识图谱.json",
        "node_count": len(merged["nodes"]),
        "edge_count": len(merged["edges"]),
        "node_types": dict(counts),
        "coverage_status": "partial",
        "scope_note": merged["metadata"]["scope_note"],
    }
    extras = []
    for payload in payloads:
        meta = payload["metadata"]
        extras.append(
            {
                "graph_id": meta["title"],
                "title": meta["title"],
                "version": "1.0",
                "grade": meta["grade"],
                "semester": meta["semester"],
                "subjects": meta["subjects"],
                "files": [meta["title"].replace("知识图谱", "") + ".json"],
                "source_graph_file": meta["title"].replace("知识图谱", "") + ".json",
                "node_count": len(payload["nodes"]),
                "edge_count": len(payload["edges"]),
                "coverage_status": "partial",
                "scope_note": meta["scope_note"],
            }
        )
    kept = [item for item in index["graphs"] if item.get("graph_id") == "GRADE5-S1-MATH-SCI"]
    index["graphs"] = [main, *kept, *extras]
    index["generated_date"] = DATE
    index["index_version"] = "3.1"
    (SRC / "知识图谱索引.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    merge(write_all())
