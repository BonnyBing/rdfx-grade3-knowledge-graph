#!/usr/bin/env python3
"""Rebuild Grade 3 Semester 1 math+science knowledge graph from textbooks and standards."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "数据源"
PUBLIC = ROOT / "public"

GRAPH_NAME = "三年级上册数学与科学知识图谱.json"
RETRIEVAL_NAME = "三年级上册数学与科学知识图谱_检索增强版.json"
INDEX_NAME = "知识图谱索引.json"


def n(id_, type_, name, status="current_book", source=None):
    node = {"id": id_, "type": type_, "name": name, "status": status}
    if source:
        node["source"] = source
    return node


def e(source, relation, target, alignment=None):
    edge = {"source": source, "relation": relation, "target": target}
    if alignment:
        edge["alignment"] = alignment
    return edge


def src_m(a, b):
    return f"数学教材书内{a}—{b}/PDF{a + 4}—{b + 4}"


def src_s(a, b):
    return f"科学教材书内{a}—{b}/PDF{a + 6}—{b + 6}"


def build_graph() -> dict:
    nodes: list[dict] = []
    edges: list[dict] = []

    # ── 学科 / 领域 ──
    nodes += [
        n("M", "subject", "数学三年级上"),
        n("M-D-N", "domain", "数与代数"),
        n("M-D-G", "domain", "图形与几何"),
        n("M-D-D", "domain", "统计与概率"),
        n("M-D-P", "domain", "综合与实践"),
        n("S", "subject", "科学三年级上"),
        n("S-D-MAT", "domain", "物质的结构、性质与变化"),
        n("S-D-EARTH", "domain", "地球系统：天气和气候"),
    ]
    edges += [
        e("M", "contains", "M-D-N"),
        e("M", "contains", "M-D-G"),
        e("M", "contains", "M-D-D"),
        e("M", "contains", "M-D-P"),
        e("S", "contains", "S-D-MAT"),
        e("S", "contains", "S-D-EARTH"),
    ]

    # ── 数学单元 ──
    math_units = [
        ("M-U1", "第一单元 混合运算", src_m(2, 12), "M-D-N"),
        ("M-U2", "第二单元 测量（二）", src_m(13, 23), "M-D-G"),
        ("M-P-CAMPUS", "综合实践 记录我们的校园", src_m(24, 27), "M-D-P"),
        ("M-U3", "第三单元 大数加与减（二）", src_m(28, 40), "M-D-N"),
        ("M-U4", "第四单元 我们生活的空间（一）", src_m(41, 48), "M-D-G"),
        ("M-U5", "第五单元 认识图形", src_m(49, 61), "M-D-G"),
        ("M-FUN", "数学好玩 搭配中的学问", src_m(62, 63), "M-D-P"),
        ("M-U6", "第六单元 乘除法的应用（二）", src_m(64, 74), "M-D-N"),
        ("M-U7", "第七单元 认识小数", src_m(75, 89), "M-D-N"),
        ("M-U8", "第八单元 调查与记录", src_m(90, 94), "M-D-D"),
        ("M-P-DATE", "综合实践 探索年月日的秘密", src_m(95, 98), "M-D-P"),
    ]
    for uid, name, source, domain in math_units:
        nodes.append(n(uid, "unit", name, source=source))
        edges.append(e(domain, "contains", uid))

    # ── 数学课次 ──
    math_lessons = [
        ("M-U1-L1", "M-U1", "小熊购物", src_m(2, 3)),
        ("M-U1-L2", "M-U1", "买文具", src_m(4, 6)),
        ("M-U1-L3", "M-U1", "过河", src_m(7, 9)),
        ("M-U2-L1", "M-U2", "铅笔有多长", src_m(13, 15)),
        ("M-U2-L2", "M-U2", "1千米有多长", src_m(16, 18)),
        ("M-U2-L3", "M-U2", "旗杆有多高", src_m(19, 20)),
        ("M-P-CAMPUS-L1", "M-P-CAMPUS", "校园里的八个方向", src_m(24, 25)),
        ("M-P-CAMPUS-L2", "M-P-CAMPUS", "有趣的几点钟方向", src_m(25, 26)),
        ("M-U3-L1", "M-U3", "捐书", src_m(28, 30)),
        ("M-U3-L2", "M-U3", "小小养殖场", src_m(31, 32)),
        ("M-U3-L3", "M-U3", "节余多少钱", src_m(33, 35)),
        ("M-U3-L4", "M-U3", "身高的增长", src_m(36, 37)),
        ("M-U3-L5", "M-U3", "里程表", src_m(38, 39)),
        ("M-U4-L1", "M-U4", "看一看（一）", src_m(41, 42)),
        ("M-U4-L2", "M-U4", "看一看（二）", src_m(43, 44)),
        ("M-U4-L3", "M-U4", "看一看（三）", src_m(45, 46)),
        ("M-U4-L4", "M-U4", "看一看（四）", src_m(47, 48)),
        ("M-U5-L1", "M-U5", "认识角", src_m(49, 50)),
        ("M-U5-L2", "M-U5", "比一比", src_m(51, 52)),
        ("M-U5-L3", "M-U5", "认识直角", src_m(53, 54)),
        ("M-U5-L4", "M-U5", "长方形与正方形", src_m(55, 56)),
        ("M-U5-L5", "M-U5", "欣赏与设计", src_m(57, 58)),
        ("M-FUN-L1", "M-FUN", "搭配中的学问", src_m(62, 63)),
        ("M-U6-L1", "M-U6", "包饺子", src_m(64, 65)),
        ("M-U6-L2", "M-U6", "需要多少钱", src_m(66, 68)),
        ("M-U6-L3", "M-U6", "丰收了", src_m(69, 70)),
        ("M-U6-L4", "M-U6", "植树", src_m(71, 72)),
        ("M-U7-L1", "M-U7", "水果店", src_m(75, 77)),
        ("M-U7-L2", "M-U7", "量身高", src_m(78, 80)),
        ("M-U7-L3", "M-U7", "货比三家", src_m(81, 82)),
        ("M-U7-L4", "M-U7", "存零用钱", src_m(83, 84)),
        ("M-U7-L5", "M-U7", "竹子的生长", src_m(85, 86)),
        ("M-U7-L6", "M-U7", "生活中的小数", src_m(87, 87)),
        ("M-U8-L1", "M-U8", "评选吉祥物", src_m(90, 91)),
        ("M-U8-L2", "M-U8", "购买水果", src_m(92, 94)),
        ("M-P-DATE-L1", "M-P-DATE", "年月日知多少", src_m(95, 96)),
        ("M-P-DATE-L2", "M-P-DATE", "一天有多长", src_m(97, 98)),
    ]
    for lid, uid, name, source in math_lessons:
        nodes.append(n(lid, "lesson", name, source=source))
        edges.append(e(uid, "contains", lid))

    # ── 科学单元与课次 ──
    nodes += [
        n("S-U-WATER", "unit", "第一单元 水", source=src_s(2, 20)),
        n("S-U-AIR", "unit", "第二单元 空气", source=src_s(22, 40)),
        n("S-U-WEATHER", "unit", "第三单元 天气", source=src_s(41, 59)),
    ]
    edges += [
        e("S-D-MAT", "contains", "S-U-WATER"),
        e("S-D-MAT", "contains", "S-U-AIR"),
        e("S-D-EARTH", "contains", "S-U-WEATHER"),
    ]
    science_lessons = [
        ("S-W1", "S-U-WATER", "水到哪里去了", src_s(2, 4)),
        ("S-W2", "S-U-WATER", "水沸腾了", src_s(5, 6)),
        ("S-W3", "S-U-WATER", "水结冰了", src_s(7, 9)),
        ("S-W4", "S-U-WATER", "冰融化了", src_s(10, 11)),
        ("S-W5", "S-U-WATER", "水能溶解多少物质", src_s(12, 14)),
        ("S-W6", "S-U-WATER", "加快溶解", src_s(15, 16)),
        ("S-W7", "S-U-WATER", "混合与分离", src_s(17, 18)),
        ("S-W8", "S-U-WATER", "它们发生了什么变化", src_s(19, 20)),
        ("S-A1", "S-U-AIR", "感受空气", src_s(22, 24)),
        ("S-A2", "S-U-AIR", "空气能占据空间吗", src_s(25, 26)),
        ("S-A3", "S-U-AIR", "压缩空气", src_s(27, 29)),
        ("S-A4", "S-U-AIR", "空气有质量吗", src_s(30, 31)),
        ("S-A5", "S-U-AIR", "一袋空气的质量是多少", src_s(32, 33)),
        ("S-A6", "S-U-AIR", "我们来做热气球", src_s(34, 35)),
        ("S-A7", "S-U-AIR", "风的成因", src_s(36, 37)),
        ("S-A8", "S-U-AIR", "空气和我们的生活", src_s(38, 40)),
        ("S-T1", "S-U-WEATHER", "我们关心天气", src_s(41, 42)),
        ("S-T2", "S-U-WEATHER", "认识气温计", src_s(43, 44)),
        ("S-T3", "S-U-WEATHER", "测量气温", src_s(45, 46)),
        ("S-T4", "S-U-WEATHER", "测量降水量", src_s(47, 49)),
        ("S-T5", "S-U-WEATHER", "观测风", src_s(50, 52)),
        ("S-T6", "S-U-WEATHER", "观察云", src_s(53, 54)),
        ("S-T7", "S-U-WEATHER", "整理我们的天气日历", src_s(55, 57)),
        ("S-T8", "S-U-WEATHER", "天气预报是怎样制作出来的", src_s(58, 59)),
    ]
    for lid, uid, name, source in science_lessons:
        nodes.append(n(lid, "lesson", name, source=source))
        edges.append(e(uid, "contains", lid))

    # ── 数学知识点：保留原 ID，并按课次补全 ──
    math_knowledge = [
        ("M-K-MIX", "乘加、乘减、除加、除减的两步混合运算"),
        ("M-K-ORDER", "先乘除后加减及小括号改变运算顺序"),
        ("M-K-PAREN", "小括号能改变运算顺序，要先算括号里面的"),
        ("M-K-LENGTH", "毫米、厘米、分米、米、千米及单位换算"),
        ("M-K-MMDM", "1厘米=10毫米，10厘米=1分米"),
        ("M-K-KM", "1000米=1千米，较远距离用千米作单位"),
        ("M-K-UNIT", "根据物体长短选择合适的长度单位"),
        ("M-K-ESTIMATE", "长度和数量的估测及结果合理性"),
        ("M-K-INDIRECT", "不能直接测量时用参照物估测或转化为可测量量"),
        ("M-K-DIRECTION", "八个方向与几点钟方向"),
        ("M-K-EIGHT", "东、南、西、北及东南、东北、西南、西北"),
        ("M-K-CLOCKDIR", "几点钟方向以观察者为中心，随转身而改变"),
        ("M-K-ADDSUB", "三位数连加、连减和加减混合及验算"),
        ("M-K-ADD", "三位数连加及凑整计算"),
        ("M-K-SUB", "三位数连减，从左往右算，计算后要验算"),
        ("M-K-ADDSUBMIX", "三位数加减混合表示收入、支出与节余"),
        ("M-K-INTERVAL", "总量、分量、起点、终点和区间量关系"),
        ("M-K-MILEAGE", "里程表两站距离等于较远站读数减较近站读数"),
        ("M-K-VIEW", "观察位置、方向、高度、遮挡与所见图像"),
        ("M-K-POS", "从不同位置观察同一物体，看到的形状可能不同"),
        ("M-K-HEIGHT", "观察高度不同，看到的范围不同"),
        ("M-K-OCCLUSION", "视线被遮挡或从窗外观察时，所见与相对位置有关"),
        ("M-K-ANGLE", "角的组成、大小及锐角直角钝角"),
        ("M-K-ANGLE-PARTS", "角由一个顶点和两条边组成"),
        ("M-K-ANGLE-OPEN", "角的大小与张口有关，与边的长短无关"),
        ("M-K-RIGHT", "用三角板认识直角，比直角小是锐角、大是钝角"),
        ("M-K-RECT", "长方形与正方形的边和角的特征"),
        ("M-K-PATTERN", "用长方形、正方形等基本图形有规律地设计图案"),
        ("M-K-COMB", "简单搭配的有序枚举与不重复不遗漏"),
        ("M-K-MULDIV", "整十整百及两位数乘除一位数"),
        ("M-K-TENS-MUL", "整十、整百乘一位数"),
        ("M-K-2D-MUL", "两位数乘一位数可拆成整十和个位分别乘再相加"),
        ("M-K-TENS-DIV", "整十、整百除以一位数"),
        ("M-K-2D-DIV", "两位数除以一位数可先分整十再分余下部分"),
        ("M-K-QUANTITY", "倍、平均分、总价等乘除数量关系"),
        ("M-K-TIMES", "一个数是另一个数的几倍用除法，求几倍用乘法"),
        ("M-K-AVG", "平均分：总量÷份数=每份数"),
        ("M-K-PRICE", "总价=单价×数量"),
        ("M-K-DECIMAL", "小数的意义、读写和现实量表示"),
        ("M-K-DEC-POINT", "小数点分隔整数部分与小数部分，会读会写小数"),
        ("M-K-DEC-MONEY", "用小数表示元、角、分：1角=0.1元，1分=0.01元"),
        ("M-K-DEC-LEN", "1分米=0.1米，1厘米=0.01米"),
        ("M-K-DECCOMP", "简单小数大小比较"),
        ("M-K-DECOPS", "生活情境中的小数加减"),
        ("M-K-ALIGN", "小数加减竖式计算时小数点要对齐"),
        ("M-K-SURVEY", "调查问题、数据收集和分类记录"),
        ("M-K-VOTE", "举手投票、逐个询问等方法收集数据，每人只记一次"),
        ("M-K-TALLY", "用画正字、符号或表格分类记录并核对总数"),
        ("M-K-DATA", "比较、解释数据并据此作出决策"),
        ("M-K-DATE", "年、月、日、大小月和平闰年"),
        ("M-K-MONTH", "大月31天、小月30天，平年二月28天、闰年二月29天"),
        ("M-K-24H", "24时记时法"),
    ]
    for kid, name in math_knowledge:
        nodes.append(n(kid, "knowledge", name, source="数学三年级上.md"))

    # 单元仍挂原有概括性知识点，保证默认隐藏课时时也能看到主干
    unit_teaches = {
        "M-U1": ["M-K-MIX", "M-K-ORDER", "M-K-PAREN"],
        "M-U2": ["M-K-LENGTH", "M-K-MMDM", "M-K-KM", "M-K-UNIT", "M-K-ESTIMATE", "M-K-INDIRECT"],
        "M-P-CAMPUS": ["M-K-DIRECTION", "M-K-EIGHT", "M-K-CLOCKDIR"],
        "M-U3": ["M-K-ADDSUB", "M-K-ADD", "M-K-SUB", "M-K-ADDSUBMIX", "M-K-INTERVAL", "M-K-MILEAGE"],
        "M-U4": ["M-K-VIEW", "M-K-POS", "M-K-HEIGHT", "M-K-OCCLUSION"],
        "M-U5": ["M-K-ANGLE", "M-K-ANGLE-PARTS", "M-K-ANGLE-OPEN", "M-K-RIGHT", "M-K-RECT", "M-K-PATTERN"],
        "M-FUN": ["M-K-COMB"],
        "M-U6": ["M-K-MULDIV", "M-K-TENS-MUL", "M-K-2D-MUL", "M-K-TENS-DIV", "M-K-2D-DIV", "M-K-QUANTITY", "M-K-TIMES", "M-K-AVG", "M-K-PRICE"],
        "M-U7": ["M-K-DECIMAL", "M-K-DEC-POINT", "M-K-DEC-MONEY", "M-K-DEC-LEN", "M-K-DECCOMP", "M-K-DECOPS", "M-K-ALIGN"],
        "M-U8": ["M-K-SURVEY", "M-K-VOTE", "M-K-TALLY", "M-K-DATA"],
        "M-P-DATE": ["M-K-DATE", "M-K-MONTH", "M-K-24H"],
    }
    for uid, kids in unit_teaches.items():
        for kid in kids:
            edges.append(e(uid, "teaches", kid))

    lesson_teaches = {
        "M-U1-L1": ["M-K-MIX"],
        "M-U1-L2": ["M-K-MIX", "M-K-ORDER"],
        "M-U1-L3": ["M-K-ORDER", "M-K-PAREN"],
        "M-U2-L1": ["M-K-LENGTH", "M-K-MMDM", "M-K-UNIT"],
        "M-U2-L2": ["M-K-LENGTH", "M-K-KM", "M-K-ESTIMATE"],
        "M-U2-L3": ["M-K-ESTIMATE", "M-K-INDIRECT"],
        "M-P-CAMPUS-L1": ["M-K-DIRECTION", "M-K-EIGHT"],
        "M-P-CAMPUS-L2": ["M-K-DIRECTION", "M-K-CLOCKDIR"],
        "M-U3-L1": ["M-K-ADDSUB", "M-K-ADD"],
        "M-U3-L2": ["M-K-ADDSUB", "M-K-SUB"],
        "M-U3-L3": ["M-K-ADDSUB", "M-K-ADDSUBMIX"],
        "M-U3-L4": ["M-K-INTERVAL"],
        "M-U3-L5": ["M-K-INTERVAL", "M-K-MILEAGE"],
        "M-U4-L1": ["M-K-VIEW", "M-K-POS", "M-K-OCCLUSION"],
        "M-U4-L2": ["M-K-VIEW", "M-K-POS"],
        "M-U4-L3": ["M-K-VIEW", "M-K-HEIGHT"],
        "M-U4-L4": ["M-K-VIEW", "M-K-OCCLUSION"],
        "M-U5-L1": ["M-K-ANGLE", "M-K-ANGLE-PARTS"],
        "M-U5-L2": ["M-K-ANGLE", "M-K-ANGLE-OPEN"],
        "M-U5-L3": ["M-K-ANGLE", "M-K-RIGHT"],
        "M-U5-L4": ["M-K-RECT"],
        "M-U5-L5": ["M-K-PATTERN"],
        "M-FUN-L1": ["M-K-COMB"],
        "M-U6-L1": ["M-K-MULDIV", "M-K-TENS-MUL"],
        "M-U6-L2": ["M-K-MULDIV", "M-K-2D-MUL", "M-K-QUANTITY", "M-K-TIMES", "M-K-PRICE"],
        "M-U6-L3": ["M-K-MULDIV", "M-K-TENS-DIV"],
        "M-U6-L4": ["M-K-MULDIV", "M-K-2D-DIV", "M-K-AVG"],
        "M-U7-L1": ["M-K-DECIMAL", "M-K-DEC-POINT", "M-K-DEC-MONEY"],
        "M-U7-L2": ["M-K-DECIMAL", "M-K-DEC-LEN"],
        "M-U7-L3": ["M-K-DECCOMP"],
        "M-U7-L4": ["M-K-DECOPS", "M-K-ALIGN"],
        "M-U7-L5": ["M-K-DECOPS", "M-K-ALIGN"],
        "M-U7-L6": ["M-K-DECIMAL", "M-K-DEC-MONEY", "M-K-DEC-LEN"],
        "M-U8-L1": ["M-K-SURVEY", "M-K-VOTE"],
        "M-U8-L2": ["M-K-SURVEY", "M-K-TALLY", "M-K-DATA"],
        "M-P-DATE-L1": ["M-K-DATE", "M-K-MONTH"],
        "M-P-DATE-L2": ["M-K-24H"],
    }
    for lid, kids in lesson_teaches.items():
        for kid in kids:
            edges.append(e(lid, "teaches", kid))

    # ── 科学知识点 ──
    science_knowledge = [
        ("S-K-STATE", "水、冰、水蒸气的状态区别、同一性与相互转化"),
        ("S-K-VAPOR", "液态水会变成看不见的水蒸气散到空气中"),
        ("S-K-BOIL", "水沸腾时温度约为100℃，变成水蒸气体积大大增加"),
        ("S-K-FREEZE", "水降温会结冰，冰和水是同一种物质"),
        ("S-K-MELT", "冰吸热融化成水"),
        ("S-K-TEMP", "温度影响水的沸腾、结冰和融化"),
        ("S-K-DISSOLVE", "溶解程度及搅拌、温度对溶解快慢的影响"),
        ("S-K-LIMIT", "一定量水中物质溶解有上限，不同物质溶解能力不同"),
        ("S-K-SPEED", "搅拌和升高水温可以加快溶解"),
        ("S-K-SEPARATE", "溶解、过滤、蒸发分离混合物"),
        ("S-K-FILTER", "过滤可分离不溶于水的固体"),
        ("S-K-EVAP-SEP", "蒸发可使溶于水的物质从溶液中分离出来"),
        ("S-K-PHYSICAL", "形状、大小或状态改变但物质本身未改变"),
        ("S-K-AIR", "空气占据空间、具有质量、可压缩并会流动"),
        ("S-K-EXIST", "空气看不见但真实存在，可通过袋子鼓起等现象感受"),
        ("S-K-SPACE", "空气占据空间"),
        ("S-K-COMPRESS", "空气可以被压缩，水几乎不能被压缩"),
        ("S-K-MASS", "空气有质量"),
        ("S-K-WEIGH", "一定量空气可用天平间接称量"),
        ("S-K-WIND", "空气受热上升与风的形成"),
        ("S-K-HOT", "热空气会上升"),
        ("S-K-FLOW", "风是空气流动的现象"),
        ("S-K-LIFE", "生物离不开空气，空气可用于助燃、充气和发电"),
        ("S-K-PHASE", "物质可分为固体、液体和气体"),
        ("S-K-WEATHER", "天气由气温、降水、风、云等要素描述"),
        ("S-K-DEF", "天气是一个地方短时间内大气的冷暖、阴晴、雨雪、风等情况"),
        ("S-K-INSTRUMENT", "气温计、雨量器、风旗和风向标的使用"),
        ("S-K-THERMO", "气温计有液泡、液柱和刻度，温度单位是摄氏度"),
        ("S-K-DAILY-T", "一天中气温不断变化，最高多在午后、最低多在清晨"),
        ("S-K-RAIN", "雨量器测量降水量，单位是毫米"),
        ("S-K-WINDDIR", "风向是风吹来的方向，用八方位和风力等级记录"),
        ("S-K-CLOUD", "云有不同形态，云量可分为晴、多云、阴"),
        ("S-K-WDATA", "天气日历、气象数据整理与变化描述"),
        ("S-K-CLIMATE", "气候是一个地方长期天气的平均状况"),
        ("S-K-FORECAST", "天气预报的信息、符号和制作流程"),
        ("S-K-PROCESS", "天气预报经观测、数值预报、会商后发布"),
    ]
    for kid, name in science_knowledge:
        nodes.append(n(kid, "knowledge", name, source="三年级上科学.md"))

    sci_unit_teaches = {
        "S-U-WATER": [
            "S-K-STATE", "S-K-VAPOR", "S-K-BOIL", "S-K-FREEZE", "S-K-MELT", "S-K-TEMP",
            "S-K-DISSOLVE", "S-K-LIMIT", "S-K-SPEED", "S-K-SEPARATE", "S-K-FILTER",
            "S-K-EVAP-SEP", "S-K-PHYSICAL",
        ],
        "S-U-AIR": [
            "S-K-AIR", "S-K-EXIST", "S-K-SPACE", "S-K-COMPRESS", "S-K-MASS", "S-K-WEIGH",
            "S-K-WIND", "S-K-HOT", "S-K-FLOW", "S-K-LIFE", "S-K-PHASE",
        ],
        "S-U-WEATHER": [
            "S-K-WEATHER", "S-K-DEF", "S-K-INSTRUMENT", "S-K-THERMO", "S-K-DAILY-T",
            "S-K-RAIN", "S-K-WINDDIR", "S-K-CLOUD", "S-K-WDATA", "S-K-CLIMATE",
            "S-K-FORECAST", "S-K-PROCESS",
        ],
    }
    for uid, kids in sci_unit_teaches.items():
        for kid in kids:
            edges.append(e(uid, "teaches", kid))

    sci_lesson_teaches = {
        "S-W1": ["S-K-STATE", "S-K-VAPOR"],
        "S-W2": ["S-K-TEMP", "S-K-BOIL", "S-K-VAPOR"],
        "S-W3": ["S-K-TEMP", "S-K-FREEZE"],
        "S-W4": ["S-K-STATE", "S-K-MELT", "S-K-TEMP"],
        "S-W5": ["S-K-DISSOLVE", "S-K-LIMIT"],
        "S-W6": ["S-K-DISSOLVE", "S-K-SPEED"],
        "S-W7": ["S-K-SEPARATE", "S-K-FILTER", "S-K-EVAP-SEP"],
        "S-W8": ["S-K-PHYSICAL", "S-K-STATE"],
        "S-A1": ["S-K-AIR", "S-K-EXIST", "S-K-PHASE"],
        "S-A2": ["S-K-AIR", "S-K-SPACE"],
        "S-A3": ["S-K-AIR", "S-K-COMPRESS"],
        "S-A4": ["S-K-AIR", "S-K-MASS"],
        "S-A5": ["S-K-AIR", "S-K-WEIGH", "S-K-MASS"],
        "S-A6": ["S-K-WIND", "S-K-HOT"],
        "S-A7": ["S-K-WIND", "S-K-FLOW", "S-K-HOT"],
        "S-A8": ["S-K-AIR", "S-K-LIFE"],
        "S-T1": ["S-K-WEATHER", "S-K-DEF"],
        "S-T2": ["S-K-INSTRUMENT", "S-K-THERMO"],
        "S-T3": ["S-K-WDATA", "S-K-DAILY-T", "S-K-THERMO"],
        "S-T4": ["S-K-INSTRUMENT", "S-K-RAIN"],
        "S-T5": ["S-K-INSTRUMENT", "S-K-WINDDIR", "S-K-FLOW"],
        "S-T6": ["S-K-WEATHER", "S-K-CLOUD"],
        "S-T7": ["S-K-WDATA", "S-K-CLIMATE"],
        "S-T8": ["S-K-FORECAST", "S-K-PROCESS"],
    }
    for lid, kids in sci_lesson_teaches.items():
        for kid in kids:
            edges.append(e(lid, "teaches", kid))

    # ── 方法技能 ──
    nodes += [
        n("M-M-DRAW", "method", "画图建立数量关系模型"),
        n("M-M-MEASURE", "method", "实际测量、估测与单位选择"),
        n("M-M-ENUM", "method", "列表、连线和符号化有序枚举"),
        n("M-M-SURVEY", "method", "调查、分类记录、核对总数和解释数据"),
        n("M-M-VERIFY", "method", "估算、验算与检查计算结果"),
        n("S-M-OBSERVE", "method", "观察、测量和如实记录"),
        n("S-M-CONTROL", "method", "控制变量与公平对比实验"),
        n("S-M-EVIDENCE", "method", "比较证据、解释现象和得出结论"),
        n("S-M-MODEL", "method", "图示、微粒模型和模拟实验"),
        n("S-M-CALENDAR", "method", "长期观测并整理天气日历"),
    ]
    method_uses = [
        ("M-U1", "M-M-DRAW"),
        ("M-U1-L1", "M-M-DRAW"),
        ("M-U2", "M-M-MEASURE"),
        ("M-U2-L1", "M-M-MEASURE"),
        ("M-U2-L3", "M-M-MEASURE"),
        ("M-U3", "M-M-VERIFY"),
        ("M-U3-L1", "M-M-VERIFY"),
        ("M-U3-L2", "M-M-VERIFY"),
        ("M-U3-L5", "M-M-DRAW"),
        ("M-FUN", "M-M-ENUM"),
        ("M-FUN-L1", "M-M-ENUM"),
        ("M-U8", "M-M-SURVEY"),
        ("M-U8-L1", "M-M-SURVEY"),
        ("M-U8-L2", "M-M-SURVEY"),
        ("S-W1", "S-M-OBSERVE"),
        ("S-W2", "S-M-OBSERVE"),
        ("S-W3", "S-M-OBSERVE"),
        ("S-W6", "S-M-CONTROL"),
        ("S-W5", "S-M-CONTROL"),
        ("S-W8", "S-M-EVIDENCE"),
        ("S-A2", "S-M-EVIDENCE"),
        ("S-A3", "S-M-MODEL"),
        ("S-A7", "S-M-MODEL"),
        ("S-T1", "S-M-CALENDAR"),
        ("S-T3", "S-M-OBSERVE"),
        ("S-T7", "S-M-CALENDAR"),
        ("S-U-WATER", "S-M-OBSERVE"),
        ("S-U-AIR", "S-M-EVIDENCE"),
        ("S-U-WEATHER", "S-M-CALENDAR"),
    ]
    for src, mid in method_uses:
        edges.append(e(src, "uses_method", mid))

    # ── 课标 ──
    nodes += [
        n("M-STD-N", "standard", "第二学段数与运算和数量关系要求", status="stage_standard", source="数学课标PDF24—26"),
        n("M-STD-MIX", "standard", "整数四则混合运算（以两步为主）及小括号", status="stage_standard", source="数学课标PDF24—26"),
        n("M-STD-DEC", "standard", "初步认识小数及一位小数加减", status="stage_standard", source="数学课标PDF24—26"),
        n("M-STD-QTY", "standard", "总量=分量之和、总价=单价×数量等常见数量关系", status="stage_standard", source="数学课标PDF25—26"),
        n("M-STD-G", "standard", "第二学段图形的认识与测量、位置与运动要求", status="stage_standard", source="数学课标PDF32—35"),
        n("M-STD-LEN", "standard", "认识千米，知道分米、毫米，能换算并估测长度", status="stage_standard", source="数学课标PDF32—33"),
        n("M-STD-ANG", "standard", "认识角，比较角的大小，辨认直角、锐角、钝角", status="stage_standard", source="数学课标PDF32—33"),
        n("M-STD-OBS", "standard", "从不同角度观察简单物体", status="stage_standard", source="数学课标PDF33"),
        n("M-STD-RECT", "standard", "认识长方形与正方形的特征", status="stage_standard", source="数学课标PDF33"),
        n("M-STD-D", "standard", "第二学段数据收集、整理与表达要求", status="stage_standard", source="数学课标PDF41—42"),
        n("M-STD-SURVEY", "standard", "经历简单数据收集整理，感受数据蕴含信息", status="stage_standard", source="数学课标PDF41"),
        n("M-STD-P", "standard", "第二学段综合与实践要求", status="stage_standard", source="数学课标PDF49—52"),
        n("M-STD-DIR", "standard", "认识八个方向与几点钟方向", status="stage_standard", source="数学课标PDF49—52"),
        n("M-STD-DATE", "standard", "认识年、月、日和24时记时法", status="stage_standard", source="数学课标PDF49"),
        n("M-LATER-FRACTION", "standard", "分数及同分母分数加减", status="stage_later", source="数学课标PDF24—26"),
        n("M-LATER-GEO", "standard", "线、量角器、三角形分类、周长面积、图形运动", status="stage_later", source="数学课标PDF32—35"),
        n("M-LATER-STATS", "standard", "条形统计图与平均数", status="stage_later", source="数学课标PDF41—42"),
        n("M-LATER-MASS", "standard", "克、千克、吨及曹冲称象主题活动", status="stage_later", source="数学课标PDF49—52"),
        n("S-STD-MAT", "standard", "3—4年级空气与水的性质要求", status="stage_standard", source="科学课标PDF23、26—30"),
        n("S-STD-AIR", "standard", "空气有质量、占空间、受热上升，风是空气流动", status="stage_standard", source="科学课标内容要求1.2"),
        n("S-STD-WATER", "standard", "冰、水、水蒸气状态区别与同一性，沸腾结冰与温度", status="stage_standard", source="科学课标内容要求1.2、2.1"),
        n("S-STD-CHANGE", "standard", "3—4年级物质状态、溶解和变化要求", status="stage_standard", source="科学课标PDF32—37"),
        n("S-STD-DISSOLVE", "standard", "一定量水中的溶解情况及搅拌、温度影响快慢", status="stage_standard", source="科学课标内容要求2.2"),
        n("S-STD-SEP", "standard", "根据物体特征或材料性质分离混合物", status="stage_standard", source="科学课标内容要求1.1"),
        n("S-STD-PHYS", "standard", "形状或大小改变但构成物体的物质没有改变", status="stage_standard", source="科学课标内容要求2.3"),
        n("S-STD-WEATHER", "standard", "3—4年级天气和气候要求", status="stage_standard", source="科学课标PDF82—86"),
        n("S-STD-WX-DATA", "standard", "用仪器测量气温、风力、风向、降水量并描述天气", status="stage_standard", source="科学课标内容要求10.1"),
        n("S-STD-TEMP-U", "standard", "描述测量温度的方法，知道摄氏度", status="stage_standard", source="科学课标内容要求4.1"),
        n("S-LATER-AIR-MIX", "standard", "空气是混合物及主要成分", status="stage_later", source="科学课标5—6年级内容要求1.2"),
        n("S-LATER-EVAP", "standard", "水的蒸发与水蒸气凝结成水", status="stage_later", source="科学课标5—6年级内容要求1.2"),
        n("S-LATER-CHEM", "standard", "物体变化时构成物质也可能改变", status="stage_later", source="科学课标5—6年级内容要求2.3"),
        n("S-LATER-RAIN", "standard", "雨、雪、雾等天气现象的成因", status="stage_later", source="科学课标5—6年级内容要求10.1"),
        n("S-LATER-SOIL", "standard", "土壤成分、水体类型等本册未覆盖的3—4年级要求", status="stage_later", source="科学课标3—4年级内容要求10.2、10.3"),
    ]

    aligns = [
        ("M-U1", "M-STD-N", "direct"),
        ("M-U1", "M-STD-MIX", "direct"),
        ("M-K-MIX", "M-STD-MIX", "direct"),
        ("M-K-ORDER", "M-STD-MIX", "direct"),
        ("M-K-PAREN", "M-STD-MIX", "direct"),
        ("M-U2", "M-STD-G", "partial"),
        ("M-U2", "M-STD-LEN", "direct"),
        ("M-K-LENGTH", "M-STD-LEN", "direct"),
        ("M-K-UNIT", "M-STD-LEN", "direct"),
        ("M-K-ESTIMATE", "M-STD-LEN", "direct"),
        ("M-P-CAMPUS", "M-STD-P", "direct"),
        ("M-P-CAMPUS", "M-STD-DIR", "direct"),
        ("M-K-DIRECTION", "M-STD-DIR", "direct"),
        ("M-K-EIGHT", "M-STD-DIR", "direct"),
        ("M-K-CLOCKDIR", "M-STD-DIR", "direct"),
        ("M-U3", "M-STD-N", "partial"),
        ("M-K-ADDSUB", "M-STD-N", "partial"),
        ("M-K-INTERVAL", "M-STD-QTY", "direct"),
        ("M-U4", "M-STD-G", "partial"),
        ("M-U4", "M-STD-OBS", "direct"),
        ("M-K-VIEW", "M-STD-OBS", "direct"),
        ("M-U5", "M-STD-G", "partial"),
        ("M-U5", "M-STD-ANG", "partial"),
        ("M-U5", "M-STD-RECT", "partial"),
        ("M-K-ANGLE", "M-STD-ANG", "partial"),
        ("M-K-RIGHT", "M-STD-ANG", "partial"),
        ("M-K-RECT", "M-STD-RECT", "partial"),
        ("M-U6", "M-STD-N", "partial"),
        ("M-U6", "M-STD-QTY", "direct"),
        ("M-K-MULDIV", "M-STD-N", "partial"),
        ("M-K-QUANTITY", "M-STD-QTY", "direct"),
        ("M-K-PRICE", "M-STD-QTY", "direct"),
        ("M-U7", "M-STD-N", "partial"),
        ("M-U7", "M-STD-DEC", "direct"),
        ("M-K-DECIMAL", "M-STD-DEC", "direct"),
        ("M-K-DECCOMP", "M-STD-DEC", "direct"),
        ("M-K-DECOPS", "M-STD-DEC", "direct"),
        ("M-U8", "M-STD-D", "partial"),
        ("M-U8", "M-STD-SURVEY", "direct"),
        ("M-K-SURVEY", "M-STD-SURVEY", "direct"),
        ("M-K-DATA", "M-STD-SURVEY", "direct"),
        ("M-P-DATE", "M-STD-P", "direct"),
        ("M-P-DATE", "M-STD-DATE", "direct"),
        ("M-K-DATE", "M-STD-DATE", "direct"),
        ("M-K-24H", "M-STD-DATE", "direct"),
        ("S-U-WATER", "S-STD-MAT", "direct"),
        ("S-U-WATER", "S-STD-CHANGE", "direct"),
        ("S-U-WATER", "S-STD-WATER", "direct"),
        ("S-U-WATER", "S-STD-DISSOLVE", "direct"),
        ("S-U-WATER", "S-STD-SEP", "direct"),
        ("S-U-WATER", "S-STD-PHYS", "direct"),
        ("S-K-STATE", "S-STD-WATER", "direct"),
        ("S-K-TEMP", "S-STD-WATER", "direct"),
        ("S-K-BOIL", "S-STD-WATER", "direct"),
        ("S-K-DISSOLVE", "S-STD-DISSOLVE", "direct"),
        ("S-K-SEPARATE", "S-STD-SEP", "direct"),
        ("S-K-PHYSICAL", "S-STD-PHYS", "direct"),
        ("S-U-AIR", "S-STD-MAT", "direct"),
        ("S-U-AIR", "S-STD-AIR", "direct"),
        ("S-K-AIR", "S-STD-AIR", "direct"),
        ("S-K-SPACE", "S-STD-AIR", "direct"),
        ("S-K-MASS", "S-STD-AIR", "direct"),
        ("S-K-HOT", "S-STD-AIR", "direct"),
        ("S-K-FLOW", "S-STD-AIR", "direct"),
        ("S-U-WEATHER", "S-STD-WEATHER", "direct"),
        ("S-U-WEATHER", "S-STD-WX-DATA", "direct"),
        ("S-U-WEATHER", "S-STD-TEMP-U", "direct"),
        ("S-K-INSTRUMENT", "S-STD-WX-DATA", "direct"),
        ("S-K-THERMO", "S-STD-TEMP-U", "direct"),
        ("S-K-WDATA", "S-STD-WX-DATA", "direct"),
        ("S-K-FORECAST", "S-STD-WEATHER", "partial"),
    ]
    for src, tgt, al in aligns:
        edges.append(e(src, "aligns_to", tgt, alignment=al))

    # ── 核心素养 ──
    nodes += [
        n("M-C-NUMBER", "competency", "数感与运算能力", status="stage_standard", source="数学课标PDF8—12"),
        n("M-C-MEASURE", "competency", "量感", status="stage_standard", source="数学课标PDF8—12"),
        n("M-C-SPACE", "competency", "几何直观与空间观念", status="stage_standard", source="数学课标PDF8—12"),
        n("M-C-DATA", "competency", "数据意识", status="stage_standard", source="数学课标PDF8—12"),
        n("M-C-MODEL", "competency", "推理意识、模型意识与应用意识", status="stage_standard", source="数学课标PDF8—12"),
        n("S-C-CONCEPT", "competency", "科学观念", status="stage_standard", source="科学课标PDF7—9"),
        n("S-C-THINK", "competency", "科学思维", status="stage_standard", source="科学课标PDF7—9、13—14"),
        n("S-C-INQUIRY", "competency", "探究实践", status="stage_standard", source="科学课标PDF7—8、15—16"),
        n("S-C-RESP", "competency", "态度责任", status="stage_standard", source="科学课标PDF8—9、17—18"),
    ]
    develops = [
        ("M-K-ORDER", "M-C-NUMBER"),
        ("M-K-MIX", "M-C-NUMBER"),
        ("M-K-DECIMAL", "M-C-NUMBER"),
        ("M-K-MULDIV", "M-C-NUMBER"),
        ("M-K-LENGTH", "M-C-MEASURE"),
        ("M-K-UNIT", "M-C-MEASURE"),
        ("M-K-ESTIMATE", "M-C-MEASURE"),
        ("M-K-DIRECTION", "M-C-SPACE"),
        ("M-K-VIEW", "M-C-SPACE"),
        ("M-K-ANGLE", "M-C-SPACE"),
        ("M-K-RECT", "M-C-SPACE"),
        ("M-K-DATA", "M-C-DATA"),
        ("M-K-SURVEY", "M-C-DATA"),
        ("M-K-QUANTITY", "M-C-MODEL"),
        ("M-K-INTERVAL", "M-C-MODEL"),
        ("M-K-COMB", "M-C-MODEL"),
        ("S-M-OBSERVE", "S-C-INQUIRY"),
        ("S-M-CALENDAR", "S-C-INQUIRY"),
        ("S-M-CONTROL", "S-C-THINK"),
        ("S-M-EVIDENCE", "S-C-THINK"),
        ("S-M-MODEL", "S-C-CONCEPT"),
        ("S-K-AIR", "S-C-CONCEPT"),
        ("S-K-STATE", "S-C-CONCEPT"),
        ("S-K-WDATA", "S-C-INQUIRY"),
        ("S-K-WEATHER", "S-C-RESP"),
        ("S-K-LIFE", "S-C-RESP"),
    ]
    for src, tgt in develops:
        edges.append(e(src, "develops", tgt))

    # ── 前置关系 ──
    prereqs = [
        ("M-K-MIX", "M-K-ORDER"),
        ("M-K-ORDER", "M-K-PAREN"),
        ("M-K-MMDM", "M-K-KM"),
        ("M-K-LENGTH", "M-K-UNIT"),
        ("M-K-EIGHT", "M-K-CLOCKDIR"),
        ("M-K-ADD", "M-K-SUB"),
        ("M-K-SUB", "M-K-ADDSUBMIX"),
        ("M-K-INTERVAL", "M-K-MILEAGE"),
        ("M-K-POS", "M-K-HEIGHT"),
        ("M-K-ANGLE-PARTS", "M-K-ANGLE-OPEN"),
        ("M-K-ANGLE-OPEN", "M-K-RIGHT"),
        ("M-K-RIGHT", "M-K-RECT"),
        ("M-K-TENS-MUL", "M-K-2D-MUL"),
        ("M-K-TENS-DIV", "M-K-2D-DIV"),
        ("M-K-MIX", "M-K-QUANTITY"),
        ("M-K-DECIMAL", "M-K-DECCOMP"),
        ("M-K-DECCOMP", "M-K-DECOPS"),
        ("M-K-DEC-POINT", "M-K-ALIGN"),
        ("M-K-SURVEY", "M-K-DATA"),
        ("M-K-DATE", "M-K-24H"),
        ("S-K-VAPOR", "S-K-BOIL"),
        ("S-K-BOIL", "S-K-FREEZE"),
        ("S-K-FREEZE", "S-K-MELT"),
        ("S-K-TEMP", "S-K-STATE"),
        ("S-K-LIMIT", "S-K-SPEED"),
        ("S-K-DISSOLVE", "S-K-SEPARATE"),
        ("S-K-STATE", "S-K-PHYSICAL"),
        ("S-K-EXIST", "S-K-SPACE"),
        ("S-K-SPACE", "S-K-COMPRESS"),
        ("S-K-MASS", "S-K-WEIGH"),
        ("S-K-AIR", "S-K-WIND"),
        ("S-K-HOT", "S-K-FLOW"),
        ("S-K-WEATHER", "S-K-WDATA"),
        ("S-K-THERMO", "S-K-DAILY-T"),
        ("S-K-WDATA", "S-K-FORECAST"),
        ("S-K-DEF", "S-K-CLIMATE"),
    ]
    for src, tgt in prereqs:
        edges.append(e(src, "prerequisite_of", tgt))

    # ── 跨学科主题 ──
    nodes += [
        n("X-WEATHER-STATION", "cross_disciplinary_theme", "校园微型气象站", status="recommended"),
        n("X-WATER-TEMP", "cross_disciplinary_theme", "水的温度与状态变化数据研究", status="recommended"),
        n("X-DISSOLVE", "cross_disciplinary_theme", "溶解速度公平实验", status="recommended"),
        n("X-AIR-MASS", "cross_disciplinary_theme", "一袋空气有多重", status="recommended"),
        n("X-WIND-MAP", "cross_disciplinary_theme", "校园风向地图", status="recommended"),
        n("X-CALENDAR", "cross_disciplinary_theme", "天气日历与年月日", status="recommended"),
        n("X-MM-RAIN", "cross_disciplinary_theme", "毫米单位与降水量测量", status="recommended"),
        n("X-CLOCK-TEMP", "cross_disciplinary_theme", "24时记时与一天气温变化", status="recommended"),
    ]
    cross = [
        ("X-WEATHER-STATION", "M-K-LENGTH"),
        ("X-WEATHER-STATION", "M-K-DIRECTION"),
        ("X-WEATHER-STATION", "M-K-DATA"),
        ("X-WEATHER-STATION", "M-K-SURVEY"),
        ("X-WEATHER-STATION", "S-K-INSTRUMENT"),
        ("X-WEATHER-STATION", "S-K-WDATA"),
        ("X-WEATHER-STATION", "S-K-THERMO"),
        ("X-WEATHER-STATION", "S-K-RAIN"),
        ("X-WATER-TEMP", "M-K-DATA"),
        ("X-WATER-TEMP", "S-K-TEMP"),
        ("X-WATER-TEMP", "S-K-STATE"),
        ("X-WATER-TEMP", "S-K-BOIL"),
        ("X-WATER-TEMP", "S-K-FREEZE"),
        ("X-DISSOLVE", "M-K-QUANTITY"),
        ("X-DISSOLVE", "M-K-DATA"),
        ("X-DISSOLVE", "S-K-DISSOLVE"),
        ("X-DISSOLVE", "S-K-SPEED"),
        ("X-DISSOLVE", "S-M-CONTROL"),
        ("X-AIR-MASS", "M-K-ESTIMATE"),
        ("X-AIR-MASS", "M-K-QUANTITY"),
        ("X-AIR-MASS", "S-K-AIR"),
        ("X-AIR-MASS", "S-K-MASS"),
        ("X-AIR-MASS", "S-K-WEIGH"),
        ("X-WIND-MAP", "M-K-DIRECTION"),
        ("X-WIND-MAP", "M-K-EIGHT"),
        ("X-WIND-MAP", "S-K-WIND"),
        ("X-WIND-MAP", "S-K-WINDDIR"),
        ("X-WIND-MAP", "S-K-INSTRUMENT"),
        ("X-CALENDAR", "M-K-DATE"),
        ("X-CALENDAR", "M-K-24H"),
        ("X-CALENDAR", "S-K-WDATA"),
        ("X-CALENDAR", "S-M-CALENDAR"),
        ("X-MM-RAIN", "M-K-LENGTH"),
        ("X-MM-RAIN", "M-K-MMDM"),
        ("X-MM-RAIN", "S-K-RAIN"),
        ("X-CLOCK-TEMP", "M-K-24H"),
        ("X-CLOCK-TEMP", "S-K-DAILY-T"),
        ("X-CLOCK-TEMP", "S-K-THERMO"),
    ]
    for src, tgt in cross:
        edges.append(e(src, "cross_links", tgt))

    return {
        "metadata": {
            "title": "智启知识图谱",
            "version": "2.0",
            "generated_date": "2026-09-09",
            "grade": "三年级",
            "semester": "上册",
            "subjects": ["数学", "科学"],
            "scope_note": "智启知识图谱面向全学段、全学科建设；当前已落地首批内容为三年级上册数学与科学，后续将持续扩展。教材节点表示本册实际学习内容；课标节点表示3—4年级第二学段要求。status=stage_later 的节点不能解释为本册已经完成。知识点按教材课次拆分，单元仍保留概括性知识点以便默认视图展示。",
            "page_reference": "textbook_printed_page/pdf_page；课程标准使用PDF页或内容要求编号",
            "source_files": [
                "三年级上数学.md",
                "三年级上科学.md",
                "（5）义务教育数学课程标准日常修订版（2022年版2025年修订）.md",
                "（10）义务教育科学课程标准日常修订版（2022年版2025年修订）.md",
            ],
            "extraction_basis": [
                "北师大版义务教育教科书数学三年级上册目录、课题正文与整理复习「我的收获」",
                "教科版义务教育教科书科学三年级上册目录、聚焦/探索/研讨/拓展",
                "义务教育数学课程标准（2022年版2025年修订）第二学段内容要求、学业要求",
                "义务教育科学课程标准（2022年版2025年修订）3—4年级物质科学与地球系统相关内容要求",
            ],
        },
        "node_types": [
            "subject", "domain", "unit", "lesson", "knowledge",
            "method", "standard", "competency", "cross_disciplinary_theme",
        ],
        "relation_types": [
            "contains", "teaches", "uses_method", "aligns_to",
            "develops", "prerequisite_of", "applies_to", "cross_links",
        ],
        "nodes": nodes,
        "edges": edges,
    }


def node_name(graph: dict, nid: str) -> str:
    for node in graph["nodes"]:
        if node["id"] == nid:
            return node["name"]
    raise KeyError(nid)


def node_obj(graph: dict, nid: str) -> dict:
    for node in graph["nodes"]:
        if node["id"] == nid:
            item = {"id": node["id"], "type": node["type"], "name": node["name"], "status": node["status"]}
            if node.get("source"):
                item["source"] = node["source"]
            return item
    raise KeyError(nid)


def rec_edge(graph: dict, source: str, relation: str, target: str, traversal: str):
    return {
        "source": source,
        "source_name": node_name(graph, source),
        "relation": relation,
        "target": target,
        "target_name": node_name(graph, target),
        "traversal": traversal,
    }


def build_retrieval(graph: dict) -> dict:
    records = [
        {
            "record_id": "RR-M-U6-X-DISSOLVE",
            "record_title": "数学第六单元乘除法的应用（二）与科学溶解速度公平实验",
            "search_terms": [
                "第六单元", "乘除法的应用（二）", "倍", "平均分", "总价", "数量关系",
                "包饺子", "需要多少钱", "植树", "科学", "水能溶解多少物质", "加快溶解",
                "溶解速度", "公平实验", "控制变量", "搅拌",
            ],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-U6", "unit_name": node_name(graph, "M-U6")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-WATER", "unit_name": node_name(graph, "S-U-WATER"), "lesson_ids": ["S-W5", "S-W6"], "lesson_names": [node_name(graph, "S-W5"), node_name(graph, "S-W6")]},
            "theme": {"id": "X-DISSOLVE", "name": node_name(graph, "X-DISSOLVE"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-U6", "M-K-QUANTITY", "X-DISSOLVE", "S-K-DISSOLVE", "S-W5"], "数学第六单元中的倍、平均分和数量关系可用于设计科学溶解速度公平实验中的材料份数、倍数和分组计算。"),
            "edge_specs": [
                ("M-U6", "teaches", "M-K-QUANTITY", "forward"),
                ("X-DISSOLVE", "cross_links", "M-K-QUANTITY", "bidirectional"),
                ("X-DISSOLVE", "cross_links", "S-K-DISSOLVE", "bidirectional"),
                ("X-DISSOLVE", "cross_links", "S-M-CONTROL", "bidirectional"),
                ("S-W5", "teaches", "S-K-DISSOLVE", "forward"),
                ("S-W6", "teaches", "S-K-DISSOLVE", "forward"),
                ("S-W6", "uses_method", "S-M-CONTROL", "forward"),
            ],
            "extra_nodes": ["S-K-SPEED", "S-M-CONTROL", "S-W6"],
        },
        {
            "record_id": "RR-M-U6-X-AIR-MASS",
            "record_title": "数学第六单元乘除法的应用（二）与一袋空气质量探究",
            "search_terms": ["第六单元", "乘除法应用", "倍", "平均分", "数量关系", "空气有质量吗", "一袋空气的质量是多少", "一袋空气有多重"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-U6", "unit_name": node_name(graph, "M-U6")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-AIR", "unit_name": node_name(graph, "S-U-AIR"), "lesson_ids": ["S-A4", "S-A5"], "lesson_names": [node_name(graph, "S-A4"), node_name(graph, "S-A5")]},
            "theme": {"id": "X-AIR-MASS", "name": node_name(graph, "X-AIR-MASS"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-U6", "M-K-QUANTITY", "X-AIR-MASS", "S-K-AIR", "S-A4"], "数学乘除数量关系可用于比较多袋空气的总质量、平均质量和倍数关系。"),
            "edge_specs": [
                ("M-U6", "teaches", "M-K-QUANTITY", "forward"),
                ("X-AIR-MASS", "cross_links", "M-K-QUANTITY", "bidirectional"),
                ("X-AIR-MASS", "cross_links", "S-K-AIR", "bidirectional"),
                ("S-A4", "teaches", "S-K-AIR", "forward"),
                ("S-A5", "teaches", "S-K-AIR", "forward"),
            ],
            "extra_nodes": ["S-K-MASS", "S-K-WEIGH", "S-A5"],
        },
        {
            "record_id": "RR-M-U8-X-WEATHER-STATION",
            "record_title": "数学第八单元调查与记录与校园微型气象站",
            "search_terms": ["第八单元", "调查与记录", "数据收集", "分类记录", "天气日历", "校园微型气象站", "气温计", "雨量器"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-U8", "unit_name": node_name(graph, "M-U8")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-WEATHER", "unit_name": node_name(graph, "S-U-WEATHER"), "lesson_ids": ["S-T2", "S-T3", "S-T4", "S-T7"], "lesson_names": [node_name(graph, "S-T2"), node_name(graph, "S-T3"), node_name(graph, "S-T4"), node_name(graph, "S-T7")]},
            "theme": {"id": "X-WEATHER-STATION", "name": node_name(graph, "X-WEATHER-STATION"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-U8", "M-K-DATA", "X-WEATHER-STATION", "S-K-WDATA", "S-T7"], "数学调查、记录和数据解释可直接用于科学天气观测数据的采集、整理、比较与表达。"),
            "edge_specs": [
                ("M-U8", "teaches", "M-K-SURVEY", "forward"),
                ("M-U8", "teaches", "M-K-DATA", "forward"),
                ("X-WEATHER-STATION", "cross_links", "M-K-DATA", "bidirectional"),
                ("X-WEATHER-STATION", "cross_links", "S-K-INSTRUMENT", "bidirectional"),
                ("X-WEATHER-STATION", "cross_links", "S-K-WDATA", "bidirectional"),
                ("S-T2", "teaches", "S-K-INSTRUMENT", "forward"),
                ("S-T7", "teaches", "S-K-WDATA", "forward"),
            ],
            "extra_nodes": ["M-K-SURVEY", "S-K-INSTRUMENT", "S-T2", "S-T3", "S-T4"],
        },
        {
            "record_id": "RR-M-U8-X-WATER-TEMP",
            "record_title": "数学第八单元调查与记录与水的温度状态变化数据研究",
            "search_terms": ["第八单元", "调查与记录", "沸腾", "结冰", "融化", "水的温度与状态变化数据研究", "100℃"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-U8", "unit_name": node_name(graph, "M-U8")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-WATER", "unit_name": node_name(graph, "S-U-WATER"), "lesson_ids": ["S-W2", "S-W3", "S-W4"], "lesson_names": [node_name(graph, "S-W2"), node_name(graph, "S-W3"), node_name(graph, "S-W4")]},
            "theme": {"id": "X-WATER-TEMP", "name": node_name(graph, "X-WATER-TEMP"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-U8", "M-K-DATA", "X-WATER-TEMP", "S-K-TEMP", "S-W2"], "数学数据收集与解释可用于记录水在沸腾、结冰和融化过程中的温度与状态变化。"),
            "edge_specs": [
                ("M-U8", "teaches", "M-K-DATA", "forward"),
                ("X-WATER-TEMP", "cross_links", "M-K-DATA", "bidirectional"),
                ("X-WATER-TEMP", "cross_links", "S-K-TEMP", "bidirectional"),
                ("X-WATER-TEMP", "cross_links", "S-K-STATE", "bidirectional"),
                ("S-W2", "teaches", "S-K-TEMP", "forward"),
                ("S-W4", "teaches", "S-K-STATE", "forward"),
            ],
            "extra_nodes": ["S-K-STATE", "S-K-BOIL", "S-W3", "S-W4"],
        },
        {
            "record_id": "RR-M-U8-X-DISSOLVE",
            "record_title": "数学第八单元调查与记录与溶解速度公平实验",
            "search_terms": ["第八单元", "调查与记录", "溶解", "加快溶解", "控制变量", "画正字"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-U8", "unit_name": node_name(graph, "M-U8")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-WATER", "unit_name": node_name(graph, "S-U-WATER"), "lesson_ids": ["S-W5", "S-W6"], "lesson_names": [node_name(graph, "S-W5"), node_name(graph, "S-W6")]},
            "theme": {"id": "X-DISSOLVE", "name": node_name(graph, "X-DISSOLVE"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-U8", "M-K-DATA", "X-DISSOLVE", "S-K-DISSOLVE", "S-W6"], "数学调查记录和数据解释可用于科学溶解实验的数据采集、组间比较和公平实验结论表达。"),
            "edge_specs": [
                ("M-U8", "teaches", "M-K-DATA", "forward"),
                ("X-DISSOLVE", "cross_links", "M-K-DATA", "bidirectional"),
                ("X-DISSOLVE", "cross_links", "S-K-DISSOLVE", "bidirectional"),
                ("S-W6", "teaches", "S-K-DISSOLVE", "forward"),
                ("S-W6", "uses_method", "S-M-CONTROL", "forward"),
            ],
            "extra_nodes": ["S-M-CONTROL", "S-W5", "S-K-SPEED"],
        },
        {
            "record_id": "RR-M-U2-X-AIR-MASS",
            "record_title": "数学第二单元测量（二）与一袋空气质量探究",
            "search_terms": ["第二单元", "测量（二）", "估测", "空气有质量吗", "一袋空气的质量是多少"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-U2", "unit_name": node_name(graph, "M-U2")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-AIR", "unit_name": node_name(graph, "S-U-AIR"), "lesson_ids": ["S-A4", "S-A5"], "lesson_names": [node_name(graph, "S-A4"), node_name(graph, "S-A5")]},
            "theme": {"id": "X-AIR-MASS", "name": node_name(graph, "X-AIR-MASS"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-U2", "M-K-ESTIMATE", "X-AIR-MASS", "S-K-AIR", "S-A5"], "数学估测和结果合理性可用于科学空气质量测量前的预测、测量后的合理性判断。"),
            "edge_specs": [
                ("M-U2", "teaches", "M-K-ESTIMATE", "forward"),
                ("X-AIR-MASS", "cross_links", "M-K-ESTIMATE", "bidirectional"),
                ("X-AIR-MASS", "cross_links", "S-K-AIR", "bidirectional"),
                ("S-A4", "teaches", "S-K-AIR", "forward"),
                ("S-A5", "teaches", "S-K-AIR", "forward"),
            ],
            "extra_nodes": ["S-K-WEIGH", "S-A4"],
        },
        {
            "record_id": "RR-M-U2-X-WEATHER-STATION",
            "record_title": "数学第二单元测量（二）与校园微型气象站",
            "search_terms": ["第二单元", "测量", "毫米", "千米", "单位选择", "雨量器", "气温计", "降水量"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-U2", "unit_name": node_name(graph, "M-U2")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-WEATHER", "unit_name": node_name(graph, "S-U-WEATHER"), "lesson_ids": ["S-T2", "S-T4", "S-T5"], "lesson_names": [node_name(graph, "S-T2"), node_name(graph, "S-T4"), node_name(graph, "S-T5")]},
            "theme": {"id": "X-WEATHER-STATION", "name": node_name(graph, "X-WEATHER-STATION"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-U2", "M-K-LENGTH", "X-WEATHER-STATION", "S-K-INSTRUMENT", "S-T4"], "数学测量、估测和单位选择可用于科学气象仪器制作、摆放和观测记录。"),
            "edge_specs": [
                ("M-U2", "teaches", "M-K-LENGTH", "forward"),
                ("X-WEATHER-STATION", "cross_links", "M-K-LENGTH", "bidirectional"),
                ("X-WEATHER-STATION", "cross_links", "S-K-INSTRUMENT", "bidirectional"),
                ("S-T2", "teaches", "S-K-INSTRUMENT", "forward"),
                ("S-T4", "teaches", "S-K-INSTRUMENT", "forward"),
            ],
            "extra_nodes": ["S-K-RAIN", "S-T5", "X-MM-RAIN"],
        },
        {
            "record_id": "RR-M-P-CAMPUS-X-WIND-MAP",
            "record_title": "数学综合实践记录我们的校园与校园风向地图",
            "search_terms": ["记录我们的校园", "八个方向", "几点钟方向", "风的成因", "观测风", "风向", "风旗", "校园风向地图"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-P-CAMPUS", "unit_name": node_name(graph, "M-P-CAMPUS")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_ids": ["S-U-AIR", "S-U-WEATHER"], "unit_names": [node_name(graph, "S-U-AIR"), node_name(graph, "S-U-WEATHER")], "lesson_ids": ["S-A7", "S-T5"], "lesson_names": [node_name(graph, "S-A7"), node_name(graph, "S-T5")]},
            "theme": {"id": "X-WIND-MAP", "name": node_name(graph, "X-WIND-MAP"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-P-CAMPUS", "M-K-DIRECTION", "X-WIND-MAP", "S-K-WIND", "S-T5"], "数学方向知识可用于科学校园风向观测点定位、风向记录和校园风向地图表达。"),
            "edge_specs": [
                ("M-P-CAMPUS", "teaches", "M-K-DIRECTION", "forward"),
                ("X-WIND-MAP", "cross_links", "M-K-DIRECTION", "bidirectional"),
                ("X-WIND-MAP", "cross_links", "S-K-WIND", "bidirectional"),
                ("X-WIND-MAP", "cross_links", "S-K-INSTRUMENT", "bidirectional"),
                ("S-A7", "teaches", "S-K-WIND", "forward"),
                ("S-T5", "teaches", "S-K-INSTRUMENT", "forward"),
            ],
            "extra_nodes": ["M-K-EIGHT", "S-K-WINDDIR", "S-A7"],
        },
        {
            "record_id": "RR-M-P-DATE-X-CALENDAR",
            "record_title": "数学年月日与科学天气日历",
            "search_terms": ["年月日", "大小月", "平年", "闰年", "24时记时法", "天气日历", "一天中气温", "气候"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-P-DATE", "unit_name": node_name(graph, "M-P-DATE")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-WEATHER", "unit_name": node_name(graph, "S-U-WEATHER"), "lesson_ids": ["S-T3", "S-T7"], "lesson_names": [node_name(graph, "S-T3"), node_name(graph, "S-T7")]},
            "theme": {"id": "X-CALENDAR", "name": node_name(graph, "X-CALENDAR"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-P-DATE", "M-K-DATE", "X-CALENDAR", "S-K-WDATA", "S-T7"], "年、月、日和24时记时法可用于科学天气日历的日期编排和一天中气温变化记录。"),
            "edge_specs": [
                ("M-P-DATE", "teaches", "M-K-DATE", "forward"),
                ("M-P-DATE", "teaches", "M-K-24H", "forward"),
                ("X-CALENDAR", "cross_links", "M-K-DATE", "bidirectional"),
                ("X-CALENDAR", "cross_links", "S-K-WDATA", "bidirectional"),
                ("S-T7", "teaches", "S-K-WDATA", "forward"),
            ],
            "extra_nodes": ["M-K-24H", "S-K-DAILY-T", "S-T3", "S-M-CALENDAR"],
        },
        {
            "record_id": "RR-M-U2-X-MM-RAIN",
            "record_title": "数学毫米单位与科学降水量测量",
            "search_terms": ["毫米", "1厘米=10毫米", "雨量器", "降水量", "降雨量", "铅笔有多长"],
            "main_scope": {"subject": "数学", "grade": "三年级", "semester": "上册", "unit_id": "M-U2", "unit_name": node_name(graph, "M-U2")},
            "cross_scope": {"subject": "科学", "grade": "三年级", "semester": "上册", "unit_id": "S-U-WEATHER", "unit_name": node_name(graph, "S-U-WEATHER"), "lesson_ids": ["S-T4"], "lesson_names": [node_name(graph, "S-T4")]},
            "theme": {"id": "X-MM-RAIN", "name": node_name(graph, "X-MM-RAIN"), "type": "cross_disciplinary_theme", "status": "recommended"},
            "path": (["M-U2", "M-K-MMDM", "X-MM-RAIN", "S-K-RAIN", "S-T4"], "数学毫米单位直接对应科学雨量器读数单位，可用于理解和记录降水量。"),
            "edge_specs": [
                ("M-U2", "teaches", "M-K-MMDM", "forward"),
                ("X-MM-RAIN", "cross_links", "M-K-LENGTH", "bidirectional"),
                ("X-MM-RAIN", "cross_links", "S-K-RAIN", "bidirectional"),
                ("S-T4", "teaches", "S-K-RAIN", "forward"),
            ],
            "extra_nodes": ["M-K-LENGTH", "S-T4"],
        },
    ]

    out_records = []
    for rec in records:
        node_ids = []
        for spec in rec["edge_specs"]:
            node_ids.extend([spec[0], spec[2]])
        node_ids.extend(rec.get("extra_nodes", []))
        seen = []
        for nid in node_ids:
            if nid not in seen:
                seen.append(nid)
        path_ids, summary = rec["path"]
        item = {
            "record_id": rec["record_id"],
            "record_title": rec["record_title"],
            "search_terms": rec["search_terms"],
            "main_scope": rec["main_scope"],
            "cross_scope": rec["cross_scope"],
            "theme": rec["theme"],
            "nodes": [node_obj(graph, nid) for nid in seen],
            "edges": [rec_edge(graph, *spec) for spec in rec["edge_specs"]],
            "evidence_path": {
                "path_id": rec["record_id"].replace("RR-", "EP-"),
                "path_sequence": path_ids,
                "path_names": [node_name(graph, nid) for nid in path_ids],
                "evidence_summary": summary,
            },
        }
        out_records.append(item)

    return {
        "metadata": {
            "title": "智启知识图谱（检索增强版 · 当前首批：三年级上册数学与科学）",
            "version": "2.0",
            "generated_date": "2026-09-09",
            "source_graph": GRAPH_NAME,
            "grade": "三年级",
            "grade_aliases": ["三年级", "小学三年级", "3年级"],
            "semester": "上册",
            "semester_aliases": ["上册", "上学期", "第一学期"],
            "subjects": ["数学", "科学"],
            "purpose": "供知识库按课题、单元、知识点和跨学科关系稳定召回。每条记录在同一片段内保留中文节点名称、原始关系边和完整证据路径。",
            "scope_note": graph["metadata"]["scope_note"],
            "relation_semantics": {
                "contains": "有向关系",
                "teaches": "有向关系",
                "uses_method": "有向关系",
                "aligns_to": "有向关系",
                "develops": "有向关系",
                "prerequisite_of": "有向关系",
                "applies_to": "有向关系",
                "cross_links": "对称关系，检索证据路径时允许双向遍历",
            },
        },
        "retrieval_records": out_records,
    }


def dump(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    graph = build_graph()
    ids = [node["id"] for node in graph["nodes"]]
    dup = [i for i, c in Counter(ids).items() if c > 1]
    if dup:
        raise SystemExit(f"duplicate ids: {dup}")
    id_set = set(ids)
    dangling = [
        f"{edge['source']} -{edge['relation']}-> {edge['target']}"
        for edge in graph["edges"]
        if edge["source"] not in id_set or edge["target"] not in id_set
    ]
    if dangling:
        raise SystemExit("dangling edges: " + "; ".join(dangling[:20]))

    retrieval = build_retrieval(graph)
    dump(SRC / GRAPH_NAME, graph)
    dump(SRC / RETRIEVAL_NAME, retrieval)
    dump(PUBLIC / "data.json", graph)
    dump(PUBLIC / "data.baseline.json", graph)

    counts = Counter(node["type"] for node in graph["nodes"])
    index = {
        "index_version": "2.0",
        "generated_date": "2026-09-09",
        "graphs": [
            {
                "graph_id": "GRADE3-S1-MATH-SCI",
                "title": "智启知识图谱",
                "version": "2.0",
                "grade": "三年级",
                "grade_aliases": ["三年级", "小学三年级", "3年级"],
                "semester": "上册",
                "semester_aliases": ["上册", "上学期", "第一学期"],
                "subjects": ["数学", "科学"],
                "files": [GRAPH_NAME, RETRIEVAL_NAME],
                "source_graph_file": GRAPH_NAME,
                "retrieval_file": RETRIEVAL_NAME,
                "node_count": len(graph["nodes"]),
                "edge_count": len(graph["edges"]),
                "retrieval_record_count": len(retrieval["retrieval_records"]),
                "node_types": dict(sorted(counts.items())),
                "coverage_status": "partial",
                "scope_note": "智启知识图谱面向全学段、全学科；当前首批落地小学三年级上册数学与科学，后续按年级/册次/学科扩展。知识点已按教材课次拆分；检索时兼容“三年级/小学三年级/3年级”和“上册/上学期/第一学期”；cross_links 按对称关系双向遍历。",
            }
        ],
    }
    dump(SRC / INDEX_NAME, index)
    print(json.dumps({
        "nodes": len(graph["nodes"]),
        "edges": len(graph["edges"]),
        "node_types": dict(sorted(counts.items())),
        "knowledge": counts["knowledge"],
        "lessons": counts["lesson"],
        "retrieval_records": len(retrieval["retrieval_records"]),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
