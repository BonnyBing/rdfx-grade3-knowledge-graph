#!/usr/bin/env python3
"""Build grade-3 English (下册) and 道德与法治 (上/下) graphs, then merge into master.

Does not rewrite math/science/chinese books. Safe to re-run: strips previous E3D/D3U/D3D/X-EMO-* nodes first.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "数据源"
PUBLIC = ROOT / "public"
DATE = "2026-10-28"

ENG_STD = "（6）义务教育英语课程标准日常修订版（2022年版2025年修订）.md"
DAO_STD = "（2）义务教育道德与法治课程标准日常修订版（2022年版2025年修订）.md"
ENG_FILE = "三年级下英语.md"
DAO_U_FILE = "三年级上道德与法治.md"
DAO_D_FILE = "三年级下道德与法治.md"

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

NEW_PREFIXES = ("E3D", "D3U", "D3D")
NEW_THEMES = {
    "X-EMO-SCHOOL",
    "X-EMO-FAMILY",
    "X-EMO-HOWMANY",
    "X-EMO-FRUIT-PRICE",
    "X-EMO-ZOO",
    "X-EMO-SAFETY",
    "X-EMO-TRAFFIC",
}


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
        "page_reference": "书内页来自教材目录和课题页。PDF 页与书内页不完全一致时以书内页为准。",
        "source_files": [textbook, standard],
        "limits": limits,
        "cross_note": cross,
    }


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
        f"- 范围：{meta.get('scope_note', '')}",
        f"- 限制：{meta.get('limits', '')}",
        "",
        "## 2. 规模",
        "",
        f"- 单元 {len(units)}，课次 {len(lessons)}，知识点 {len(knowledge)}，节点 {len(graph.nodes)}，边 {len(graph.edges)}",
        f"- stage_later 学段后续要求 {len(later)} 条",
        "",
        "## 3. 单元一览",
        "",
    ]
    for unit in units:
        lines.append(f"- {unit['name']}（{unit.get('source', '')}）")
    lines.extend(["", "## 4. 学段后续（本册未系统完成）", ""])
    for node in later:
        lines.append(f"- {node['name']}")
    lines.extend(
        [
            "",
            "## 5. 跨学科",
            "",
            meta.get("cross_note", "跨学科边只在总图中建立。"),
            "",
        ]
    )
    return "\n".join(lines) + "\n"


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


def build_english() -> Graph:
    g = Graph(
        meta_for(
            "三年级下册英语知识图谱",
            "三年级",
            "下册",
            ["英语"],
            ENG_FILE,
            "人民教育出版社义务教育教科书英语（PEP）（三年级起点）",
            ENG_STD,
            "对齐英语课标 3～4 年级 / 一级。本册未系统完成的同学段要求标为 stage_later。",
            "教材依据 2011 年版课标编写体系；对齐时使用 2022 年版、2025 年修订英语课标一级要求，主题一致不写成完全覆盖。",
            "跨学科边只在总图中建立，且只连接教材内容确实相关的节点。",
        )
    )
    sid = "E3D"
    g.add(sid, "subject", "英语三年级下", order=10, source=f"{ENG_FILE}封面｜人民教育出版社")

    standards = [
        ("E3D-STD-THEME-SCHOOL", "围绕学校生活等熟悉主题，进行简单交流", "一级主题·人与社会｜学校生活", "stage_standard"),
        ("E3D-STD-THEME-FAMILY", "围绕家庭成员等熟悉主题，介绍基本信息", "一级主题·人与自我｜家庭生活", "stage_standard"),
        ("E3D-STD-THEME-ANIMAL", "围绕动物等熟悉主题，用简单语句描述外形特征", "一级主题·人与自然｜动物", "stage_standard"),
        ("E3D-STD-VOCAB", "借助图片、实物理解词汇意思，根据提示说出单词和短语", "一级语言知识·词汇", "stage_standard"),
        ("E3D-STD-SENTENCE", "在语境中理解简单句的表意功能，交流个人信息与喜好", "一级语言知识·语法/语用", "stage_standard"),
        ("E3D-STD-LISTEN", "理解课堂简单指令并作出反应；听懂日常问候与简单对话", "一级语言技能·理解性技能", "stage_standard"),
        ("E3D-STD-SPEAK", "互致问候，交流姓名、家庭、喜好等简单信息；跟读并朗读所学对话", "一级语言技能·表达性技能", "stage_standard"),
        ("E3D-STD-WRITE", "正确书写字母、单词和句子；根据图片或语境仿写简单句子", "一级语言技能·表达性技能", "stage_standard"),
        ("E3D-STD-CULTURE", "感知中外姓名、称谓、问候及学校/家庭生活等表达异同", "一级文化知识", "stage_standard"),
    ]
    for nid, name, where, status in standards:
        g.add(nid, "standard", name, status=status, source=f"{ENG_STD}｜{where}")
        g.edge(sid, "contains", nid)

    later = [
        ("E3D-LATER-PHONICS", "本册未系统完成：感知简单拼读规则并尝试借助规则拼读单词", "一级语音"),
        ("E3D-LATER-READING-VOL", "本册未核验：课外阅读量累计达到 1500～2000 词", "一级理解性技能"),
        ("E3D-LATER-VIEWING", "本册未核验：课外视听活动每周不少于 30 分钟", "一级理解性技能"),
        ("E3D-LATER-ROLEPLAY-EXT", "本册未系统教学：在画面提示下为所学对话/故事配音等“级别+”要求", "一级表达性技能+"),
        ("E3D-LATER-STORY-TELL", "本册未系统教学：口头描述事件或讲述小故事（级别+）", "一级表达性技能+"),
    ]
    for nid, name, where in later:
        g.add(nid, "standard", name, status="stage_later", source=f"{ENG_STD}｜{where}")
        g.edge(sid, "contains", nid)

    for key, name in (
        ("LANG", "语言能力"),
        ("CUL", "文化意识"),
        ("THINK", "思维品质"),
        ("LEARN", "学习能力"),
    ):
        cid = f"{sid}-C-{key}"
        g.add(cid, "competency", name, source=f"{ENG_STD}｜核心素养内涵：{name}")
        g.edge(sid, "develops", cid)

    g.add(f"{sid}-D-THEME", "domain", "主题与语篇交际")
    g.edge(sid, "contains", f"{sid}-D-THEME")
    g.add(
        f"{sid}-M-LISTEN-SPEAK",
        "method",
        "听音模仿、跟读对话、看图说词句",
        source=src_text(ENG_FILE, 2, "Let’s talk / Let’s learn 活动"),
    )
    g.edge(sid, "contains", f"{sid}-M-LISTEN-SPEAK")

    units = [
        {
            "name": "Welcome back to school!",
            "page": 2,
            "lessons": [
                ("Let’s talk：欢迎返校与新朋友", 3),
                ("Let’s learn：China / USA / Canada / UK", 5),
                ("Let’s talk：Where are you from?", 7),
            ],
            "knowledge": [
                ("用 Welcome! 欢迎同学返校", 4, "E3D-STD-SPEAK", "direct"),
                ("询问并回答 Where are you from? / I’m from …", 7, "E3D-STD-THEME-SCHOOL", "direct"),
                ("认读 China、USA、Canada、UK 等国名", 5, "E3D-STD-VOCAB", "direct"),
                ("用 he/she、teacher、student 等介绍人物身份", 8, "E3D-STD-SENTENCE", "partial"),
            ],
        },
        {
            "name": "My family",
            "page": 12,
            "lessons": [
                ("Let’s talk：Who’s that man/woman?", 14),
                ("Let’s learn：father / mother 等家庭成员", 15),
                ("Let’s talk：Is she your mother?", 17),
            ],
            "knowledge": [
                ("询问 Who’s that …? 并介绍父母", 14, "E3D-STD-THEME-FAMILY", "direct"),
                ("认读 father、mother、brother、sister、grandparents、family", 15, "E3D-STD-VOCAB", "direct"),
                ("用 Yes, she is. / No, he isn’t. 确认家庭成员", 17, "E3D-STD-SENTENCE", "direct"),
            ],
        },
        {
            "name": "At the zoo",
            "page": 22,
            "lessons": [
                ("Let’s talk：It’s so tall!", 24),
                ("Let’s learn：tall / short / fat / thin", 25),
                ("Let’s talk：It has …", 27),
            ],
            "knowledge": [
                ("用 tall/short/fat/thin/big/small/long 描述动物外形", 25, "E3D-STD-THEME-ANIMAL", "direct"),
                ("用 It has … 描述身体部位特征", 27, "E3D-STD-SENTENCE", "direct"),
                ("认读 giraffe、children、tail 等词汇", 24, "E3D-STD-VOCAB", "partial"),
            ],
        },
        {
            "name": "Recycle 1",
            "page": 32,
            "lessons": [("综合复习 Unit 1—3", 32)],
            "knowledge": [
                ("综合运用返校、家庭、动物主题的听说表达", 32, "E3D-STD-SPEAK", "partial"),
            ],
        },
        {
            "name": "Where is my car?",
            "page": 36,
            "lessons": [
                ("Let’s talk：Where is …?", 38),
                ("Let’s learn：in / on / under", 39),
                ("Let’s talk：Is it in your bag?", 41),
            ],
            "knowledge": [
                ("用 Where is …? 询问物品位置", 38, "E3D-STD-LISTEN", "direct"),
                ("用 in / on / under 描述位置", 39, "E3D-STD-VOCAB", "direct"),
                ("用 Yes, it is. / No, it isn’t. 确认位置", 41, "E3D-STD-SENTENCE", "direct"),
            ],
        },
        {
            "name": "Do you like pears?",
            "page": 46,
            "lessons": [
                ("Let’s talk：Do you like …?", 48),
                ("Let’s learn：pear / apple / orange / banana", 49),
                ("Let’s talk：Sorry, I don’t like … / Me, neither.", 51),
            ],
            "knowledge": [
                ("用 Do you like …? Yes, I do. / No, I don’t. 表达喜好", 48, "E3D-STD-SPEAK", "direct"),
                ("认读 pear、apple、orange、banana、watermelon、strawberry、grape、fruit", 49, "E3D-STD-VOCAB", "direct"),
                ("在买水果情境中使用 Let’s buy some fruit.", 48, "E3D-STD-THEME-SCHOOL", "partial"),
            ],
        },
        {
            "name": "How many?",
            "page": 56,
            "lessons": [
                ("Let’s talk：How many … do you see?", 58),
                ("Let’s learn：eleven—fifteen", 59),
                ("Let’s talk：How many … do you have?", 61),
            ],
            "knowledge": [
                ("用 How many … do you see/have? 询问数量", 58, "E3D-STD-SENTENCE", "direct"),
                ("认读 eleven 到 twenty", 59, "E3D-STD-VOCAB", "direct"),
            ],
        },
        {
            "name": "Recycle 2",
            "page": 66,
            "lessons": [("综合复习 Unit 4—6", 66)],
            "knowledge": [
                ("综合运用方位、喜好、数量主题的听说表达", 66, "E3D-STD-SPEAK", "partial"),
            ],
        },
    ]

    unit_labels = {
        1: "Unit 1 Welcome back to school!",
        2: "Unit 2 My family",
        3: "Unit 3 At the zoo",
        4: "Recycle 1",
        5: "Unit 4 Where is my car?",
        6: "Unit 5 Do you like pears?",
        7: "Unit 6 How many?",
        8: "Recycle 2",
    }
    for index, unit in enumerate(units, start=1):
        uid = f"{sid}-U{index:02d}"
        g.add(
            uid,
            "unit",
            unit_labels[index],
            source=src_text(ENG_FILE, unit["page"], unit["name"]),
        )
        g.edge(f"{sid}-D-THEME", "contains", uid)
        g.edge(uid, "uses_method", f"{sid}-M-LISTEN-SPEAK")
        for li, (lname, lpage) in enumerate(unit["lessons"], start=1):
            lid = f"{uid}-L{li}"
            g.add(lid, "lesson", lname, source=src_text(ENG_FILE, lpage, lname))
            g.edge(uid, "contains", lid)
        for ki, (kname, kpage, std, align) in enumerate(unit["knowledge"], start=1):
            kid = f"{uid}-K{ki}"
            g.add(kid, "knowledge", kname, source=src_text(ENG_FILE, kpage, kname))
            g.edge(uid, "teaches", kid)
            g.edge(kid, "uses_method", f"{sid}-M-LISTEN-SPEAK")
            g.edge(kid, "aligns_to", std, align)
            for comp in (f"{sid}-C-LANG", f"{sid}-C-LEARN"):
                g.edge(kid, "develops", comp)
    return g


def build_dao(semester: str) -> Graph:
    is_upper = semester == "上册"
    sid = "D3U" if is_upper else "D3D"
    file_name = DAO_U_FILE if is_upper else DAO_D_FILE
    title = f"三年级{semester}道德与法治知识图谱"
    subject_name = f"道德与法治三年级{ '上' if is_upper else '下' }"
    order = 11 if is_upper else 12

    g = Graph(
        meta_for(
            title,
            "三年级",
            semester,
            ["道德与法治"],
            file_name,
            "教育部组织编写·人民教育出版社义务教育教科书",
            DAO_STD,
            "对齐道德与法治课标第二学段（3～4年级）。本册未系统完成的同学段要求标为 stage_later。",
            "教材为 2018 年版；对齐时使用 2022 年版、2025 年修订课标第二学段要求，主题一致不写成完全覆盖。",
            "跨学科边只在总图中建立，且只连接教材内容确实相关的节点。",
        )
    )
    g.add(sid, "subject", subject_name, order=order, source=f"{file_name}封面｜人民教育出版社")

    standards = [
        ("D3X-STD-LEARN", "主动学习、合理安排学习，做学习的主人", "第二学段·道德教育（学习习惯与学习态度）"),
        ("D3X-STD-SCHOOL", "尊重老师，与同学平等友好相处，关心集体荣誉", "第二学段·道德教育（学校生活）"),
        ("D3X-STD-FAMILY", "关心家庭生活，体贴父母，主动分担力所能及的家务", "第二学段·道德教育（家庭生活）"),
        ("D3X-STD-SELF", "了解自己、悦纳自己；正确对待他人评价与差异", "第二学段·生命安全与健康教育 / 道德教育"),
        ("D3X-STD-HONEST", "学习分辨是非，做了错事勇于承认和改正，不撒谎", "第二学段·道德教育（诚实）"),
        ("D3X-STD-NEIGHBOR", "懂得邻里和睦相处；了解家乡并关注家乡发展变化", "第二学段·道德教育（邻里与家乡）"),
        ("D3X-STD-PUBLIC", "体验公共设施便利，形成爱护公共设施人人有责的意识", "第二学段·道德教育（公共生活）"),
        ("D3X-STD-RULE", "懂得遵守规则的重要性，自觉遵守与生活密切相关的规则", "第二学段·法治教育 / 道德教育"),
        ("D3X-STD-HELP", "懂得感恩，乐于助人，传递爱心", "第二学段·道德教育（助人）"),
        ("D3X-STD-LIFE", "珍爱生命，掌握基本安全保健常识，遇险懂得求助", "第二学段·生命安全与健康教育"),
        ("D3X-STD-TRAFFIC", "了解交通安全常识与标识，安全出行", "第二学段·生命安全与健康教育 / 法治教育"),
        ("D3X-STD-COMM", "了解通信给生活带来的便利与联系", "第二学段·道德教育（社会生活扩展）"),
    ]
    # Unique IDs per book while sharing conceptual names
    std_map = {}
    for base, name, where in standards:
        nid = base.replace("D3X", sid)
        std_map[base] = nid
        g.add(nid, "standard", name, status="stage_standard", source=f"{DAO_STD}｜{where}")
        g.edge(sid, "contains", nid)

    later_items = [
        ("LATER-NETWORK", "本册未系统教学：正确运用网络和电子产品，文明上网", "第二学段·道德教育"),
        ("LATER-NATION", "本册未系统完成：初步感知基本国情、国家统一与民族团结等国情教育专题", "第二学段·国情教育"),
        ("LATER-TRADITION", "本册未系统完成：中华优秀传统文化代表性成果与革命传统专题", "第二学段·中华优秀传统文化与革命传统教育"),
        ("LATER-CONSUME", "本册未系统教学：合理消费、勤俭节约与劳动创造财富", "第二学段·道德教育"),
        ("LATER-CORE-VALUES", "本册未单列专题：初步理解并在集体活动中系统践行社会主义核心价值观", "第二学段·道德教育"),
    ]
    for key, name, where in later_items:
        nid = f"{sid}-{key}"
        g.add(nid, "standard", name, status="stage_later", source=f"{DAO_STD}｜{where}")
        g.edge(sid, "contains", nid)

    for key, name in (
        ("POL", "政治认同"),
        ("MOR", "道德修养"),
        ("LAW", "法治观念"),
        ("PERSON", "健全人格"),
        ("RESP", "责任意识"),
    ):
        cid = f"{sid}-C-{key}"
        g.add(cid, "competency", name, source=f"{DAO_STD}｜核心素养内涵：{name}")
        g.edge(sid, "develops", cid)

    g.add(f"{sid}-D-LIFE", "domain", "成长中的生活主题")
    g.edge(sid, "contains", f"{sid}-D-LIFE")
    g.add(
        f"{sid}-M-DISCUSS",
        "method",
        "交流园讨论、活动园实践与调查体验",
        source=src_text(file_name, 2, "交流园 / 活动园"),
    )
    g.edge(sid, "contains", f"{sid}-M-DISCUSS")

    if is_upper:
        units = [
            (
                "快乐学习",
                2,
                [
                    ("学习伴我成长", 2, "D3X-STD-LEARN", "direct"),
                    ("我学习，我快乐", 8, "D3X-STD-LEARN", "direct"),
                    ("做学习的主人", 14, "D3X-STD-LEARN", "direct"),
                ],
                [
                    ("成长的每一步都离不开学习", 2, "D3X-STD-LEARN", "direct"),
                    ("体会学习带来的本领与快乐", 8, "D3X-STD-LEARN", "direct"),
                    ("做学习的主人：主动学习、合理安排", 14, "D3X-STD-LEARN", "direct"),
                ],
            ),
            (
                "我们的学校",
                24,
                [
                    ("说说我们的学校", 24, "D3X-STD-SCHOOL", "direct"),
                    ("走近我们的老师", 32, "D3X-STD-SCHOOL", "direct"),
                    ("让我们的学校更美好", 40, "D3X-STD-SCHOOL", "direct"),
                ],
                [
                    ("认识学校环境与校园生活", 24, "D3X-STD-SCHOOL", "direct"),
                    ("感受老师辛劳并尊敬老师", 32, "D3X-STD-SCHOOL", "direct"),
                    ("关心集体，用行动让学校更美好", 40, "D3X-STD-SCHOOL", "direct"),
                ],
            ),
            (
                "安全护我成长",
                46,
                [
                    ("生命最宝贵", 46, "D3X-STD-LIFE", "direct"),
                    ("安全记心上", 54, "D3X-STD-LIFE", "direct"),
                    ("心中的“110”", 62, "D3X-STD-LIFE", "direct"),
                ],
                [
                    ("珍爱生命，感受家人对生命的呵护", 46, "D3X-STD-LIFE", "direct"),
                    ("记住生活中的安全注意事项", 54, "D3X-STD-LIFE", "direct"),
                    ("遇险懂得求助，了解报警与自我保护", 62, "D3X-STD-LIFE", "direct"),
                ],
            ),
            (
                "家是最温暖的地方",
                66,
                [
                    ("父母多爱我", 66, "D3X-STD-FAMILY", "direct"),
                    ("爸爸妈妈在我心中", 72, "D3X-STD-FAMILY", "direct"),
                    ("家庭的记忆", 78, "D3X-STD-FAMILY", "direct"),
                ],
                [
                    ("感受父母的关爱与辛苦", 66, "D3X-STD-FAMILY", "direct"),
                    ("了解并体谅父母的心事与习惯", 72, "D3X-STD-FAMILY", "direct"),
                    ("珍惜家庭记忆与家庭温暖", 78, "D3X-STD-FAMILY", "partial"),
                ],
            ),
        ]
    else:
        units = [
            (
                "我和我的同伴",
                2,
                [
                    ("我是独特的", 2, "D3X-STD-SELF", "direct"),
                    ("不一样的你我他", 10, "D3X-STD-SELF", "direct"),
                    ("我很诚实", 16, "D3X-STD-HONEST", "direct"),
                    ("同学相伴", 22, "D3X-STD-SCHOOL", "direct"),
                ],
                [
                    ("认识并悦纳自己的特点", 2, "D3X-STD-SELF", "direct"),
                    ("尊重同学之间的差异", 10, "D3X-STD-SELF", "direct"),
                    ("诚实守信，知错就改", 16, "D3X-STD-HONEST", "direct"),
                    ("珍惜同学相伴的友好交往", 22, "D3X-STD-SCHOOL", "direct"),
                ],
            ),
            (
                "我在这里长大",
                28,
                [
                    ("我的家在这里", 28, "D3X-STD-NEIGHBOR", "direct"),
                    ("我家的好邻居", 34, "D3X-STD-NEIGHBOR", "direct"),
                    ("请到我的家乡来", 42, "D3X-STD-NEIGHBOR", "direct"),
                ],
                [
                    ("认识自己生活的地方与家乡", 28, "D3X-STD-NEIGHBOR", "direct"),
                    ("邻里之间要和睦相处", 34, "D3X-STD-NEIGHBOR", "direct"),
                    ("介绍家乡并感受家乡变化", 42, "D3X-STD-NEIGHBOR", "direct"),
                ],
            ),
            (
                "我们的公共生活",
                50,
                [
                    ("大家的“朋友”", 50, "D3X-STD-PUBLIC", "direct"),
                    ("生活离不开规则", 58, "D3X-STD-RULE", "direct"),
                    ("爱心的传递者", 64, "D3X-STD-HELP", "direct"),
                ],
                [
                    ("公共设施方便生活，人人爱护", 50, "D3X-STD-PUBLIC", "direct"),
                    ("生活离不开规则，自觉遵守公共规则", 58, "D3X-STD-RULE", "direct"),
                    ("做爱心的传递者，乐于助人", 64, "D3X-STD-HELP", "direct"),
                ],
            ),
            (
                "多样的交通和通信",
                70,
                [
                    ("四通八达的交通", 70, "D3X-STD-TRAFFIC", "partial"),
                    ("慧眼看交通", 78, "D3X-STD-TRAFFIC", "direct"),
                    ("万里一线牵", 82, "D3X-STD-COMM", "direct"),
                ],
                [
                    ("认识多样交通方式给生活带来便利", 70, "D3X-STD-TRAFFIC", "partial"),
                    ("识别交通安全要点与相关标识", 78, "D3X-STD-TRAFFIC", "direct"),
                    ("理解通信把远方的人连在一起", 82, "D3X-STD-COMM", "direct"),
                ],
            ),
        ]

    for index, (uname, upage, lessons, knowledge) in enumerate(units, start=1):
        uid = f"{sid}-U{index:02d}"
        g.add(uid, "unit", f"第{index}单元 {uname}", source=src_text(file_name, upage, uname))
        g.edge(f"{sid}-D-LIFE", "contains", uid)
        g.edge(uid, "uses_method", f"{sid}-M-DISCUSS")
        for li, lesson in enumerate(lessons, start=1):
            lname, lpage, std_key, align = lesson
            lid = f"{uid}-L{li}"
            g.add(lid, "lesson", lname, source=src_text(file_name, lpage, lname))
            g.edge(uid, "contains", lid)
            g.edge(lid, "aligns_to", std_map[std_key], align)
        for ki, item in enumerate(knowledge, start=1):
            kname, kpage, std_key, align = item
            kid = f"{uid}-K{ki}"
            g.add(kid, "knowledge", kname, source=src_text(file_name, kpage, kname))
            g.edge(uid, "teaches", kid)
            g.edge(kid, "uses_method", f"{sid}-M-DISCUSS")
            g.edge(kid, "aligns_to", std_map[std_key], align)
            g.edge(kid, "develops", f"{sid}-C-MOR")
            g.edge(kid, "develops", f"{sid}-C-RESP")
    return g


def is_owned(node_id: str) -> bool:
    return node_id in NEW_THEMES or node_id.startswith(NEW_PREFIXES)


def merge(payloads: list[dict]):
    master_path = SRC / "智启知识图谱.json"
    base = json.loads(master_path.read_text(encoding="utf-8"))
    nodes = [n for n in base["nodes"] if not is_owned(n["id"])]
    edges = [
        e
        for e in base["edges"]
        if not is_owned(e["source"]) and not is_owned(e["target"])
    ]
    ids = {n["id"] for n in nodes}

    for payload in payloads:
        for node in payload["nodes"]:
            if node["id"] in ids:
                raise SystemExit(f"id collision: {node['id']}")
            nodes.append(node)
            ids.add(node["id"])
        edges.extend(payload["edges"])

    themes = [
        ("X-EMO-SCHOOL", "返校与学校生活", "三年级", "上册", ["E3D-U01-K1", "D3U-U02-K1"]),
        ("X-EMO-FAMILY", "家庭成员与亲情", "三年级", "上册", ["E3D-U02-K1", "D3U-U04-K1"]),
        ("X-EMO-HOWMANY", "数量表达与数量关系", "三年级", "下册", ["E3D-U07-K1", "M-K-QUANTITY"]),
        ("X-EMO-FRUIT-PRICE", "买水果与数量单价", "三年级", "下册", ["E3D-U06-K1", "M-K-PRICE"]),
        ("X-EMO-ZOO", "动物外形与多样动物", "三年级", "下册", ["E3D-U03-K1", "S6D-U-BIO-L4"]),
        ("X-EMO-SAFETY", "生命安全与乘车防护", "三年级", "上册", ["D3U-U03-K2", "S5-K-HEALTH-PROTECT-NERVE"]),
        ("X-EMO-TRAFFIC", "交通安全与出行防护", "三年级", "下册", ["D3D-U04-K2", "S5-K-HEALTH-PROTECT-NERVE"]),
    ]
    for tid, name, grade, semester, targets in themes:
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

    types = Counter(n["type"] for n in nodes)
    books = [
        {"grade": "三年级", "semester": "上册", "subjects": ["数学", "科学", "道德与法治"]},
        {"grade": "三年级", "semester": "下册", "subjects": ["英语", "道德与法治"]},
        {"grade": "四年级", "semester": "上册", "subjects": ["数学", "语文"]},
        {"grade": "四年级", "semester": "下册", "subjects": ["科学"]},
        {"grade": "五年级", "semester": "上册", "subjects": ["数学", "科学", "语文"]},
        {"grade": "五年级", "semester": "下册", "subjects": ["科学"]},
        {"grade": "六年级", "semester": "上册", "subjects": ["数学", "科学", "语文"]},
        {"grade": "六年级", "semester": "下册", "subjects": ["科学"]},
    ]
    old_meta = base.get("metadata", {})
    source_files = list(dict.fromkeys(
        list(old_meta.get("source_files", []))
        + [ENG_FILE, DAO_U_FILE, DAO_D_FILE, ENG_STD, DAO_STD]
    ))
    version = "3.2"
    merged = {
        "metadata": {
            "title": "智启知识图谱",
            "version": version,
            "generated_date": DATE,
            "grade": "三年级、四年级、五年级、六年级",
            "semester": "上册、下册",
            "grades": ["三年级", "四年级", "五年级", "六年级"],
            "subjects": ["数学", "科学", "语文", "英语", "道德与法治"],
            "scope_note": "总图在原有数学、科学、语文基础上，新增三年级下册英语，以及三年级上/下册道德与法治。全部视角按学科分块，学科内部按年级和册次排列。未传年级时仍默认三年级。status=stage_later 不是本册已经掌握。英语对齐 3～4 年级/一级；道德与法治对齐第二学段（3～4年级）。",
            "page_reference": old_meta.get(
                "page_reference",
                "书内页来自教材目录和课题页。",
            ),
            "source_files": source_files,
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
    master_path.write_text(text, encoding="utf-8")
    (PUBLIC / "data.json").write_text(text, encoding="utf-8")
    (PUBLIC / "data.baseline.json").write_text(text, encoding="utf-8")
    update_index(merged, payloads, version)
    print(f"merged nodes {len(nodes)} edges {len(edges)}")


def update_index(merged: dict, payloads: list[dict], version: str):
    index_path = SRC / "知识图谱索引.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    counts = Counter(node["type"] for node in merged["nodes"])
    main = {
        "graph_id": "ZHIQI-KG",
        "title": "智启知识图谱",
        "version": version,
        "grade": "三年级、四年级、五年级、六年级",
        "grade_aliases": ["三年级", "四年级", "五年级", "六年级"],
        "semester": "上册、下册",
        "semester_aliases": ["上册", "下册"],
        "subjects": ["数学", "科学", "语文", "英语", "道德与法治"],
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
        stem = meta["title"].replace("知识图谱", "")
        extras.append(
            {
                "graph_id": meta["title"],
                "title": meta["title"],
                "version": "1.0",
                "grade": meta["grade"],
                "semester": meta["semester"],
                "subjects": meta["subjects"],
                "files": [f"{stem}.json"],
                "source_graph_file": f"{stem}.json",
                "node_count": len(payload["nodes"]),
                "edge_count": len(payload["edges"]),
                "coverage_status": "partial",
                "scope_note": meta["scope_note"],
            }
        )
    # Keep existing book entries except replace/add the three new ones
    keep = []
    drop_titles = {p["metadata"]["title"] for p in payloads}
    for item in index.get("graphs", []):
        gid = item.get("graph_id")
        if gid in ("ZHIQI-KG",) or gid in drop_titles or item.get("title") in drop_titles:
            continue
        keep.append(item)
    index["graphs"] = [main, *keep, *extras]
    index["generated_date"] = DATE
    index["index_version"] = version
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    graphs = [build_english(), build_dao("上册"), build_dao("下册")]
    payloads = []
    for graph in graphs:
        stem = graph.metadata["title"].replace("知识图谱", "")
        payloads.append(dump_book(graph, stem))
        print(f"{stem}: nodes {len(graph.nodes)} edges {len(graph.edges)}")
    merge(payloads)


if __name__ == "__main__":
    main()
