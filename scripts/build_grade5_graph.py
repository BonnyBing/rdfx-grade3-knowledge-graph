#!/usr/bin/env python3
"""Build Grade 5 Semester 1 math+science graph and merge it with Grade 3 for the local page."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "数据源"
PUBLIC = ROOT / "public"

G5_JSON = SRC / "五年级上册数学与科学知识图谱.json"
G5_READING = SRC / "五年级上册-数学科学-知识图谱-阅读版.md"
G5_MACHINE = SRC / "五年级上册-数学科学-知识图谱-机器版.md"
G3_JSON = SRC / "三年级上册数学与科学知识图谱.json"
INDEX_JSON = SRC / "知识图谱索引.json"
PUBLIC_JSON = PUBLIC / "data.json"


def n(id_, type_, name, status="current_book", source=None, overview=None):
    node = {"id": id_, "type": type_, "name": name, "status": status, "grade": "五年级", "semester": "上册"}
    if source:
        node["source"] = source
    if overview is not None:
        node["overview"] = overview
    return node


def e(source, relation, target, alignment=None):
    edge = {"source": source, "relation": relation, "target": target}
    if alignment:
        edge["alignment"] = alignment
    return edge


def mp(start, end, evidence):
    return f"数学教材书内{start}—{end}｜{evidence}"


def sp(start, end, evidence):
    if start == end:
        return f"科学教材书内{start}｜{evidence}"
    return f"科学教材书内{start}—{end}｜{evidence}"


def build_graph():
    nodes = []
    edges = []

    def add_n(*args, **kwargs):
        nodes.append(n(*args, **kwargs))

    def add_e(*args, **kwargs):
        edges.append(e(*args, **kwargs))

    add_n("M5", "subject", "数学五年级上")
    add_n("M5-D-N", "domain", "数与代数")
    add_n("M5-D-G", "domain", "图形与几何")
    add_n("M5-D-D", "domain", "统计与概率")
    add_n("M5-D-P", "domain", "综合与实践")
    add_n("S5", "subject", "科学五年级上")
    add_n("S5-D-MAT", "domain", "物质的运动与相互作用：光")
    add_n("S5-D-EARTH", "domain", "地球系统：地表变化")
    add_n("S5-D-TIME", "domain", "计量时间")
    add_n("S5-D-LIFE", "domain", "生命科学：健康生活")
    for child, parent in [
        ("M5-D-N", "M5"),
        ("M5-D-G", "M5"),
        ("M5-D-D", "M5"),
        ("M5-D-P", "M5"),
        ("S5-D-MAT", "S5"),
        ("S5-D-EARTH", "S5"),
        ("S5-D-TIME", "S5"),
        ("S5-D-LIFE", "S5"),
    ]:
        add_e(parent, "contains", child)

    units = [
        ("M5-U1", "第一单元 小数的再认识和加减法", mp(2, 20, "第一单元"), "M5-D-N"),
        ("M5-U2", "第二单元 三角形的再认识", mp(21, 30, "第二单元"), "M5-D-G"),
        ("M5-P-TILE", "综合实践 小小设计师", mp(31, 34, "小小设计师"), "M5-D-P"),
        ("M5-U3", "第三单元 小数乘法", mp(35, 49, "第三单元"), "M5-D-N"),
        ("M5-U4", "第四单元 用字母表示（一）", mp(50, 59, "第四单元"), "M5-D-N"),
        ("M5-U5", "第五单元 多边形的面积", mp(60, 79, "第五单元"), "M5-D-G"),
        ("M5-FUN", "数学好玩 鸡兔同笼", mp(80, 81, "鸡兔同笼"), "M5-D-P"),
        ("M5-U6", "第六单元 图形的位置与运动（一）", mp(82, 88, "第六单元"), "M5-D-G"),
        ("M5-U7", "第七单元 倍数与因数", mp(89, 101, "第七单元"), "M5-D-N"),
        ("M5-U8", "第八单元 可能性", mp(102, 108, "第八单元"), "M5-D-D"),
        ("M5-P-LEAF", "综合实践 多少落叶能铺满", mp(109, 112, "多少落叶能铺满"), "M5-D-P"),
        ("M5-REV", "总复习", mp(113, 120, "总复习"), "M5-D-P"),
        ("S5-U1", "第一单元 光", sp(2, 20, "光"), "S5-D-MAT"),
        ("S5-U2", "第二单元 地球表面的变化", sp(21, 39, "地球表面的变化"), "S5-D-EARTH"),
        ("S5-U3", "第三单元 计量时间", sp(40, 57, "计量时间"), "S5-D-TIME"),
        ("S5-U4", "第四单元 健康生活", sp(58, 76, "健康生活"), "S5-D-LIFE"),
    ]
    for uid, name, source, domain in units:
        add_n(uid, "unit", name, source=source)
        add_e(domain, "contains", uid)

    lessons = [
        ("M5-U1-L1", "小数的再认识（一）", "M5-U1", mp(2, 20, "小数的再认识（一）：1.11元、黑板有多长")),
        ("M5-U1-L2", "小数的再认识（二）", "M5-U1", mp(2, 20, "小数的再认识（二）")),
        ("M5-U1-L3", "比大小", "M5-U1", mp(2, 20, "比大小：谁跳得高、谁跳得最远")),
        ("M5-U1-L4", "买菜", "M5-U1", mp(2, 20, "买菜")),
        ("M5-U1-L5", "称体重", "M5-U1", mp(2, 20, "称体重")),
        ("M5-U1-L6", "歌手大赛", "M5-U1", mp(2, 20, "歌手大赛")),
        ("M5-U2-L1", "探索三角形内角和", "M5-U2", mp(21, 30, "探索三角形内角和")),
        ("M5-U2-L2", "探索三角形三边关系", "M5-U2", mp(21, 30, "探索三角形三边关系")),
        ("M5-U2-L3", "探索内角和的奥秘", "M5-U2", mp(21, 30, "探索内角和的奥秘")),
        ("M5-P-TILE-L1", "欣赏并设计密铺", "M5-P-TILE", mp(31, 34, "寻找密铺图形、设计密铺作品")),
        ("M5-U3-L1", "买文具", "M5-U3", mp(35, 49, "买文具")),
        ("M5-U3-L2", "街心广场", "M5-U3", mp(35, 49, "街心广场")),
        ("M5-U3-L3", "包装", "M5-U3", mp(35, 49, "包装")),
        ("M5-U3-L4", "蚕丝", "M5-U3", mp(35, 49, "蚕丝")),
        ("M5-U3-L5", "手拉手", "M5-U3", mp(35, 49, "手拉手")),
        ("M5-U3-L6", "购物", "M5-U3", mp(35, 49, "购物")),
        ("M5-U4-L1", "青蛙歌", "M5-U4", mp(50, 59, "青蛙歌")),
        ("M5-U4-L2", "回声测距离", "M5-U4", mp(50, 59, "回声测距离")),
        ("M5-U4-L3", "用字母表示数量关系", "M5-U4", mp(50, 59, "用字母表示数量关系")),
        ("M5-U4-L4", "用字母表示规律", "M5-U4", mp(50, 59, "用字母表示规律")),
        ("M5-U4-L5", "等式中的规律", "M5-U4", mp(50, 59, "等式中的规律：天平两侧同时增加或减少相同质量仍平衡")),
        ("M5-U5-L1", "比较图形的面积", "M5-U5", mp(60, 79, "比较图形的面积")),
        ("M5-U5-L2", "认识底和高", "M5-U5", mp(60, 79, "认识底和高")),
        ("M5-U5-L3", "探索平行四边形面积", "M5-U5", mp(60, 79, "探索平行四边形面积")),
        ("M5-U5-L4", "探索三角形面积", "M5-U5", mp(60, 79, "探索三角形面积")),
        ("M5-U5-L5", "探索梯形面积", "M5-U5", mp(60, 79, "探索梯形面积")),
        ("M5-U5-L6", "组合图形的面积", "M5-U5", mp(60, 79, "组合图形的面积")),
        ("M5-U5-L7", "公顷、平方千米", "M5-U5", mp(60, 79, "公顷、平方千米")),
        ("M5-U5-L8", "成长的脚印", "M5-U5", mp(60, 79, "成长的脚印：估计脚印面积")),
        ("M5-FUN-L1", "鸡兔同笼", "M5-FUN", mp(80, 81, "鸡兔同笼")),
        ("M5-U6-L1", "确定位置", "M5-U6", mp(82, 88, "确定位置：用数对表示座位")),
        ("M5-U6-L2", "摆图案", "M5-U6", mp(82, 88, "摆图案：数对与转动")),
        ("M5-U6-L3", "国庆阅兵", "M5-U6", mp(82, 88, "国庆阅兵：方格纸上平移")),
        ("M5-U6-L4", "可爱的小猫", "M5-U6", mp(82, 88, "可爱的小猫：用数对把图形放大")),
        ("M5-U7-L1", "倍数与因数", "M5-U7", mp(89, 101, "倍数与因数")),
        ("M5-U7-L2", "2、5、3的倍数特征", "M5-U7", mp(89, 101, "探索2、5、3的倍数特征")),
        ("M5-U7-L3", "最大公因数和最小公倍数", "M5-U7", mp(89, 101, "最大公因数和最小公倍数")),
        ("M5-U7-L4", "质数与合数", "M5-U7", mp(89, 101, "质数与合数；1既不是质数也不是合数")),
        ("M5-U8-L1", "不确定性", "M5-U8", mp(102, 108, "不确定性：掷硬币")),
        ("M5-U8-L2", "谁先走", "M5-U8", mp(102, 108, "谁先走")),
        ("M5-U8-L3", "摸球游戏", "M5-U8", mp(102, 108, "摸球游戏")),
        ("M5-P-LEAF-L1", "测量地面并估测落叶面积", "M5-P-LEAF", mp(109, 112, "测量地面的面积、估测落叶面积")),
        ("S5-U1-L1", "有关光的思考", "S5-U1", sp(2, 4, "有关光的思考")),
        ("S5-U1-L2", "光是怎样传播的", "S5-U1", sp(5, 6, "光是怎样传播的")),
        ("S5-U1-L3", "光的传播会遇到阻碍吗", "S5-U1", sp(7, 9, "光的传播会遇到阻碍吗")),
        ("S5-U1-L4", "光的传播方向会发生改变吗", "S5-U1", sp(10, 11, "光由空气射入水中")),
        ("S5-U1-L5", "认识棱镜", "S5-U1", sp(12, 14, "认识棱镜")),
        ("S5-U1-L6", "光的反射现象", "S5-U1", sp(15, 17, "光的反射现象")),
        ("S5-U1-L7", "制作一个潜望镜", "S5-U1", sp(18, 20, "制作一个潜望镜")),
        ("S5-U2-L1", "地球的表面", "S5-U2", sp(21, 23, "地球的表面")),
        ("S5-U2-L2", "地球的结构", "S5-U2", sp(24, 25, "地球的结构")),
        ("S5-U2-L3", "地震的成因及作用", "S5-U2", sp(26, 28, "地震的成因及作用")),
        ("S5-U2-L4", "火山喷发的成因及作用", "S5-U2", sp(29, 31, "火山喷发的成因及作用")),
        ("S5-U2-L5", "风的作用", "S5-U2", sp(32, 33, "风的作用")),
        ("S5-U2-L6", "水的作用", "S5-U2", sp(34, 36, "水的作用")),
        ("S5-U2-L7", "总结我们的认识", "S5-U2", sp(37, 39, "总结我们的认识")),
        ("S5-U3-L1", "时间在流逝", "S5-U3", sp(40, 42, "时间在流逝")),
        ("S5-U3-L2", "用水计量时间", "S5-U3", sp(43, 44, "用水计量时间")),
        ("S5-U3-L3", "我们的水钟", "S5-U3", sp(45, 46, "我们的水钟")),
        ("S5-U3-L4", "机械摆钟", "S5-U3", sp(47, 49, "机械摆钟")),
        ("S5-U3-L5", "摆的快慢", "S5-U3", sp(50, 51, "摆的快慢")),
        ("S5-U3-L6", "制作钟摆", "S5-U3", sp(52, 53, "制作钟摆")),
        ("S5-U3-L7", "计量时间和我们的生活", "S5-U3", sp(54, 57, "计量时间和我们的生活")),
        ("S5-U4-L1", "我们的身体", "S5-U4", sp(58, 60, "我们的身体")),
        ("S5-U4-L2", "身体的运动", "S5-U4", sp(61, 63, "身体的运动")),
        ("S5-U4-L3", "心脏和血液", "S5-U4", sp(64, 66, "心脏和血液")),
        ("S5-U4-L4", "身体的总指挥", "S5-U4", sp(67, 68, "身体的总指挥")),
        ("S5-U4-L5", "身体的联络员", "S5-U4", sp(69, 71, "身体的联络员")),
        ("S5-U4-L6", "学会管理和控制自己", "S5-U4", sp(72, 73, "学会管理和控制自己")),
        ("S5-U4-L7", "制订健康生活计划", "S5-U4", sp(74, 76, "制订健康生活计划")),
    ]
    for lid, name, unit, source in lessons:
        add_n(lid, "lesson", name, source=source)
        add_e(unit, "contains", lid)

    knowledge = [
        ("M5-K-DEC-PLACE", "小数按计数单位表示现实量，10个0.01是0.1", "M5-U1", ["M5-U1-L1", "M5-U1-L2"], mp(2, 20, "我的收获：1.2=1+0.2，10个0.01是0.1"), True),
        ("M5-K-DEC-ADD", "小数加减要小数点对齐，相同计数单位才能相加减", "M5-U1", ["M5-U1-L4", "M5-U1-L5", "M5-U1-L6"], mp(2, 20, "我的收获：小数点要对齐"), True),
        ("M5-K-DEC-CMP", "比较小数先比整数部分，再逐位比较小数部分", "M5-U1", ["M5-U1-L3"], mp(2, 20, "比大小"), True),
        ("M5-K-TRI-SUM", "三角形内角和是180°", "M5-U2", ["M5-U2-L1"], mp(21, 30, "我的收获：各种三角形的内角和都是180°"), True),
        ("M5-K-TRI-SIDE", "三角形任意两边之和大于第三边", "M5-U2", ["M5-U2-L2"], mp(21, 30, "我的收获"), True),
        ("M5-K-TRI-DRAW", "根据条件可以用尺规作出三角形", "M5-U2", ["M5-U2-L3"], mp(21, 30, "我的收获：用尺规作出一个三角形"), False),
        ("M5-K-TILE", "有的图形可以密铺平面，并能用来设计图案", "M5-P-TILE", ["M5-P-TILE-L1"], mp(31, 34, "寻找密铺图形、设计密铺作品"), True),
        ("M5-K-DEC-MUL", "小数乘法先按整数乘法计算，再由小数位数确定积的小数点", "M5-U3", ["M5-U3-L1", "M5-U3-L4"], mp(35, 49, "我的收获：积的小数位数"), True),
        ("M5-K-DEC-LAW", "整数的运算顺序和运算律在小数乘法中同样适用", "M5-U3", ["M5-U3-L5"], mp(35, 49, "我的收获"), False),
        ("M5-K-DEC-EST", "小数乘法估算可以选择往大估或往小估", "M5-U3", ["M5-U3-L6"], mp(35, 49, "我的收获：估算时有时还需要往小了估"), False),
        ("M5-K-LETTER", "用字母表示数量、关系和规律，字母表示的是一类情况", "M5-U4", ["M5-U4-L1", "M5-U4-L3", "M5-U4-L4"], mp(50, 59, "青蛙歌、用字母表示数量关系和规律"), True),
        ("M5-K-EQ", "等式两边同时加上或减去相同的数，相等关系不变", "M5-U4", ["M5-U4-L5"], mp(50, 59, "天平两侧同时增加或减少相同质量仍平衡"), True),
        ("M5-K-AREA-FORM", "平行四边形、三角形、梯形的面积都转化成学过的图形来推导", "M5-U5", ["M5-U5-L3", "M5-U5-L4", "M5-U5-L5"], mp(60, 79, "我的收获：出入相补"), True),
        ("M5-K-AREA-UNIT", "较大土地面积用公顷、平方千米作单位", "M5-U5", ["M5-U5-L7"], mp(60, 79, "公顷、平方千米"), False),
        ("M5-K-AREA-IRR", "不规则图形的面积可以数方格或分割后估计", "M5-U5", ["M5-U5-L1", "M5-U5-L8"], mp(60, 79, "比较图形的面积；成长的脚印"), True),
        ("M5-K-CAGE", "鸡兔同笼可以用假设或列表尝试求解", "M5-FUN", ["M5-FUN-L1"], mp(80, 81, "鸡兔同笼"), True),
        ("M5-K-PAIR", "用有序数对表示方格或座位上的位置", "M5-U6", ["M5-U6-L1", "M5-U6-L2"], mp(82, 88, "确定位置"), True),
        ("M5-K-MOVE", "在方格纸上按格数平移图形，并用数对描述平移后的点", "M5-U6", ["M5-U6-L3"], mp(82, 88, "国庆阅兵：向左平移4格"), True),
        ("M5-K-SCALE", "把图形各点的数对按规律变化，可以在方格纸上放大图形", "M5-U6", ["M5-U6-L4"], mp(82, 88, "可爱的小猫"), False),
        ("M5-K-FACTOR", "一个数的因数成对寻找，倍数通过乘法得到", "M5-U7", ["M5-U7-L1"], mp(89, 101, "我的收获"), True),
        ("M5-K-MULTIPLE", "知道2、3、5的倍数特征，以及公因数、公倍数", "M5-U7", ["M5-U7-L2", "M5-U7-L3"], mp(89, 101, "我的收获"), True),
        ("M5-K-PRIME", "质数只有1和它本身两个因数，合数有更多因数，1两者都不是", "M5-U7", ["M5-U7-L4"], mp(89, 101, "我的收获"), True),
        ("M5-K-CHANCE", "有的事情结果不确定，可以列出可能结果并比较可能性大小", "M5-U8", ["M5-U8-L1", "M5-U8-L2", "M5-U8-L3"], mp(102, 108, "掷硬币、谁先走、摸球"), True),
        ("M5-K-LEAF", "先测量地面面积，再估测一片落叶面积，推算大约需要多少片", "M5-P-LEAF", ["M5-P-LEAF-L1"], mp(109, 112, "多少落叶能铺满"), True),
        ("S5-K-SEE", "没有光就看不见物体，看到物体需要来自光源或反射的光进入眼睛", "S5-U1", ["S5-U1-L1"], sp(2, 4, "如果没有光，会发生什么"), True),
        ("S5-K-LINE", "光在空气中沿直线传播", "S5-U1", ["S5-U1-L2"], sp(5, 6, "光是怎样传播的"), True),
        ("S5-K-BLOCK", "光照射到不透明物体时会被挡住，并形成影子", "S5-U1", ["S5-U1-L3"], sp(7, 9, "光能穿过任何物体吗"), True),
        ("S5-K-REFRACT", "光由空气斜射入水或玻璃时路线发生改变，这是光的折射", "S5-U1", ["S5-U1-L4", "S5-U1-L5"], sp(10, 14, "聚焦：光由空气斜射入水中时路线变化叫作折射"), False),
        ("S5-K-PRISM", "白光通过三棱镜会形成彩色光带", "S5-U1", ["S5-U1-L5"], sp(12, 14, "白光通过三棱镜时发生了什么变化"), True),
        ("S5-K-REFLECT", "光遇到镜面会反射，可以画出反射路线", "S5-U1", ["S5-U1-L6"], sp(15, 17, "光是怎样从镜子反射回来的"), True),
        ("S5-K-SCOPE", "潜望镜利用平面镜反射改变光的路线", "S5-U1", ["S5-U1-L7"], sp(18, 20, "制作一个潜望镜"), False),
        ("S5-K-LAND", "地球表面有不同地形，现在的面貌是变化形成的", "S5-U2", ["S5-U2-L1"], sp(21, 23, "地球表面的主要地形"), True),
        ("S5-K-LAYER", "地球内部可以分成地壳、地幔和地核", "S5-U2", ["S5-U2-L2"], sp(24, 25, "地球内部结构是怎样的"), True),
        ("S5-K-QUAKE", "地震是地球内部能量释放引起的，会改变地表", "S5-U2", ["S5-U2-L3"], sp(26, 28, "地震是怎样形成的"), True),
        ("S5-K-VOLCANO", "火山喷发会改变地球表面", "S5-U2", ["S5-U2-L4"], sp(29, 31, "火山喷发是怎样形成的"), True),
        ("S5-K-WIND", "风可以吹走土壤、卷起沙子，缓慢改变地表", "S5-U2", ["S5-U2-L5"], sp(32, 33, "风能吹跑土壤、吹起沙子"), False),
        ("S5-K-WATER", "降雨和河流能改变地表，例如形成沟壑", "S5-U2", ["S5-U2-L6"], sp(34, 36, "降雨会对地表产生怎样的影响"), True),
        ("S5-K-CLOCK", "人们曾经用日影、燃香、水钟等方式计量时间", "S5-U3", ["S5-U3-L1", "S5-U3-L2"], sp(40, 44, "古人曾用过哪些方法计时"), True),
        ("S5-K-PENDULUM", "摆的快慢与摆绳长短有关，实验要记录一定时间内的摆动次数", "S5-U3", ["S5-U3-L4", "S5-U3-L5", "S5-U3-L6"], sp(47, 53, "研讨：摆的快慢与摆绳长短有什么关系；制作方案写明摆得慢要缩短摆绳"), True),
        ("S5-K-TIME-LIFE", "精确计时用来安排生活、交通和需要准时的工作", "S5-U3", ["S5-U3-L7"], sp(54, 57, "时刻表可以保障交通有序运行"), False),
        ("S5-K-BMI", "体质记录里的体重指数等指标用小数表示，并和标准范围比较", "S5-U4", ["S5-U4-L1"], sp(58, 60, "五年级体质标准表中的小数"), True),
        ("S5-K-MOVE-BODY", "骨、关节和肌肉相互配合完成身体运动", "S5-U4", ["S5-U4-L2"], sp(61, 63, "骨、关节和肌肉如何配合举起哑铃"), True),
        ("S5-K-HEART", "心脏跳动把血液运到身体各部分", "S5-U4", ["S5-U4-L3"], sp(64, 66, "心脏跳动有什么意义"), True),
        ("S5-K-BRAIN", "脑指挥身体活动和学习，需要保护", "S5-U4", ["S5-U4-L4"], sp(67, 68, "脑对我们的学习和生活有什么意义"), False),
        ("S5-K-NERVE", "人体对环境刺激做出反应，要经过感受、传递和作出反应", "S5-U4", ["S5-U4-L5"], sp(69, 71, "人体对环境刺激做出反应需要经过哪些步骤"), False),
        ("S5-K-HABIT", "睡眠、饮食、运动和情绪管理影响健康，可以制订健康生活计划", "S5-U4", ["S5-U4-L6", "S5-U4-L7"], sp(72, 76, "制订健康生活计划"), True),
    ]
    for kid, name, unit, lesson_ids, source, overview in knowledge:
        add_n(kid, "knowledge", name, source=source, overview=overview)
        add_e(unit, "teaches", kid)
        for lid in lesson_ids:
            add_e(lid, "teaches", kid)

    methods = [
        ("M5-M-ALIGN", "小数点对齐的竖式计算", "M5-K-DEC-ADD"),
        ("M5-M-EST", "选择往大估或往小估", "M5-K-DEC-EST"),
        ("M5-M-CONVERT", "把新图形转化成学过的图形求面积", "M5-K-AREA-FORM"),
        ("M5-M-GRID", "数方格估计不规则图形面积", "M5-K-AREA-IRR"),
        ("M5-M-LETTER", "用字母或含字母的式子表示关系和规律", "M5-K-LETTER"),
        ("S5-M-EXP", "观察、实验并记录现象", "S5-K-LINE"),
        ("S5-M-CTRL", "分别改变一个因素做对比实验", "S5-K-PENDULUM"),
        ("S5-M-MAKE", "制作潜望镜、水钟或钟摆", "S5-K-SCOPE"),
    ]
    for mid, name, knowledge_id in methods:
        add_n(mid, "method", name, source="教材活动中的方法")
        add_e(knowledge_id, "uses_method", mid)

    standards = [
        ("M5-STD-DEC", "结合具体情境理解小数的意义，会比较小数大小，能进行简单的小数运算", "stage_standard", "数学课标第三学段数与运算内容要求(2)(4)", "current"),
        ("M5-STD-EQ", "根据具体情境理解等式的基本性质", "stage_standard", "数学课标第三学段数量关系内容要求(1)", "current"),
        ("M5-STD-EST", "在解决实际问题的过程中会选择合适的方法进行估算", "stage_standard", "数学课标第三学段数量关系内容要求(2)", "current"),
        ("M5-STD-LETTER", "在具体情境中用字母表示事物的关系、性质和规律", "stage_standard", "数学课标第三学段数量关系内容要求(3)", "current"),
        ("M5-STD-TRI", "知道三角形任意两边之和大于第三边，知道三角形内角和是180°", "stage_standard", "数学课标第三学段图形的认识与测量内容要求(1)", "current"),
        ("M5-STD-AREA", "探索并掌握平行四边形、三角形和梯形的面积公式，知道公顷和平方千米，会估计不规则图形的面积", "stage_standard", "数学课标第三学段图形的认识与测量内容要求(3)", "current"),
        ("M5-STD-PAIR", "能用有序数对表示点的位置", "stage_standard", "数学课标第三学段图形的位置与运动内容要求(2)", "current"),
        ("M5-STD-MOVE", "能在方格纸上进行简单图形的平移，并能按比例放大或缩小简单图形", "stage_standard", "数学课标第三学段图形的位置与运动内容要求(3)(4)", "current"),
        ("M5-STD-FACTOR", "知道2、3、5的倍数特征，了解公因数、公倍数、质数和合数", "stage_standard", "数学课标第三学段数与运算内容要求(1)", "current"),
        ("M5-STD-CHANCE", "感受简单随机现象，能对可能性大小作定性描述", "stage_standard", "数学课标第三学段随机现象发生的可能性", "current"),
        ("M5-STD-FRAC", "分数的意义、小数与分数互化，以及分数四则运算", "stage_later", "数学课标第三学段数与运算内容要求(2)(4)，本册未系统学习分数", "later"),
        ("M5-STD-RATIO", "比和比例、按比例分配、成正比的量", "stage_later", "数学课标第三学段数量关系内容要求(4)(5)，本册未系统学习", "later"),
        ("M5-STD-CIRCLE", "圆和扇形、圆周率、圆的周长和面积", "stage_later", "数学课标第三学段图形的认识与测量内容要求(2)，本册未系统学习", "later"),
        ("M5-STD-VOLUME", "体积、容积以及长方体、正方体、圆柱、圆锥", "stage_later", "数学课标第三学段图形的认识与测量内容要求(4)(5)，本册未系统学习", "later"),
        ("M5-STD-DATA", "折线统计图、扇形统计图和百分数", "stage_later", "数学课标第三学段数据的收集、整理与表达，本册统计内容只到可能性", "later"),
        ("S5-STD-SEE", "来自光源或物体的反射光进入眼睛，才能看到光源或该物体", "stage_standard", "科学课标5～6年级3.3内容要求4", "current"),
        ("S5-STD-LINE", "光在空气中沿直线传播", "stage_standard", "科学课标5～6年级3.3内容要求5", "current"),
        ("S5-STD-REFLECT", "光遇到物体会发生反射，传播方向会改变", "stage_standard", "科学课标5～6年级3.3内容要求6", "current"),
        ("S5-STD-PRISM", "太阳光穿过三棱镜形成彩色光带，太阳光包含不同颜色的光", "stage_standard", "科学课标5～6年级3.3内容要求7", "current"),
        ("S5-STD-LAYER", "地球内部分为地壳、地幔和地核；火山喷发和地震是地球内部能量释放", "stage_standard", "科学课标5～6年级10.4内容要求4", "current"),
        ("S5-STD-WATER", "水在改变地表形态的过程中发挥重要作用", "stage_standard", "科学课标5～6年级10.2内容要求2", "current"),
        ("S5-STD-HEALTH", "列举睡眠、饮食、运动等影响健康的因素，养成良好生活习惯", "stage_standard", "科学课标5～6年级7.3内容要求2", "current"),
        ("S5-STD-ROCK", "岩石由矿物组成，并比较岩石的外部特征", "stage_later", "科学课标5～6年级10.3内容要求3，本册未系统学习矿物和岩石分类", "later"),
        ("S5-STD-WEATHER", "雨、雪、雾等天气现象的成因", "stage_later", "科学课标5～6年级10.1内容要求1，本册未系统学习", "later"),
        ("S5-STD-ASTRO", "地球自转、公转、月相和太阳系", "stage_later", "科学课标5～6年级9.2至9.5，本册未系统学习", "later"),
    ]
    for sid, name, status, source, _flag in standards:
        add_n(sid, "standard", name, status=status, source=source)

    alignments = [
        ("M5-K-DEC-PLACE", "M5-STD-DEC", "direct"),
        ("M5-K-DEC-ADD", "M5-STD-DEC", "partial"),
        ("M5-K-DEC-CMP", "M5-STD-DEC", "direct"),
        ("M5-K-DEC-MUL", "M5-STD-DEC", "partial"),
        ("M5-K-EQ", "M5-STD-EQ", "direct"),
        ("M5-K-DEC-EST", "M5-STD-EST", "direct"),
        ("M5-K-LETTER", "M5-STD-LETTER", "direct"),
        ("M5-K-TRI-SUM", "M5-STD-TRI", "direct"),
        ("M5-K-TRI-SIDE", "M5-STD-TRI", "direct"),
        ("M5-K-AREA-FORM", "M5-STD-AREA", "direct"),
        ("M5-K-AREA-UNIT", "M5-STD-AREA", "direct"),
        ("M5-K-AREA-IRR", "M5-STD-AREA", "direct"),
        ("M5-K-LEAF", "M5-STD-AREA", "partial"),
        ("M5-K-PAIR", "M5-STD-PAIR", "direct"),
        ("M5-K-MOVE", "M5-STD-MOVE", "partial"),
        ("M5-K-SCALE", "M5-STD-MOVE", "partial"),
        ("M5-K-FACTOR", "M5-STD-FACTOR", "direct"),
        ("M5-K-MULTIPLE", "M5-STD-FACTOR", "direct"),
        ("M5-K-PRIME", "M5-STD-FACTOR", "direct"),
        ("M5-K-CHANCE", "M5-STD-CHANCE", "direct"),
        ("S5-K-SEE", "S5-STD-SEE", "direct"),
        ("S5-K-LINE", "S5-STD-LINE", "direct"),
        ("S5-K-BLOCK", "S5-STD-LINE", "partial"),
        ("S5-K-REFLECT", "S5-STD-REFLECT", "direct"),
        ("S5-K-SCOPE", "S5-STD-REFLECT", "extension"),
        ("S5-K-PRISM", "S5-STD-PRISM", "direct"),
        ("S5-K-REFRACT", "S5-STD-REFLECT", "extension"),
        ("S5-K-LAYER", "S5-STD-LAYER", "direct"),
        ("S5-K-QUAKE", "S5-STD-LAYER", "direct"),
        ("S5-K-VOLCANO", "S5-STD-LAYER", "direct"),
        ("S5-K-WATER", "S5-STD-WATER", "direct"),
        ("S5-K-WIND", "S5-STD-WATER", "extension"),
        ("S5-K-HABIT", "S5-STD-HEALTH", "direct"),
        ("S5-K-BMI", "S5-STD-HEALTH", "partial"),
        ("S5-K-PENDULUM", "S5-STD-LINE", "unmapped"),
    ]
    for src, tgt, alignment in alignments:
        if alignment == "unmapped":
            continue
        add_e(src, "aligns_to", tgt, alignment)

    competencies = [
        ("M5-C-NUMBER", "数感与运算能力", "数学课标第三学段学业质量"),
        ("M5-C-SYMBOL", "符号意识", "数学课标第三学段数量关系"),
        ("M5-C-MEASURE", "量感", "数学课标第三学段图形测量"),
        ("M5-C-SPACE", "几何直观与空间观念", "数学课标第三学段图形与几何"),
        ("M5-C-DATA", "数据意识", "数学课标第三学段统计与概率"),
        ("S5-C-CONCEPT", "科学观念", "科学课标核心素养"),
        ("S5-C-THINK", "科学思维", "科学课标核心素养"),
        ("S5-C-INQUIRY", "探究实践", "科学课标核心素养"),
        ("S5-C-RESP", "态度责任", "科学课标核心素养"),
    ]
    for cid, name, source in competencies:
        add_n(cid, "competency", name, status="stage_standard", source=source)
    for src, tgt in [
        ("M5-K-DEC-PLACE", "M5-C-NUMBER"),
        ("M5-K-DEC-MUL", "M5-C-NUMBER"),
        ("M5-K-LETTER", "M5-C-SYMBOL"),
        ("M5-K-AREA-FORM", "M5-C-MEASURE"),
        ("M5-K-PAIR", "M5-C-SPACE"),
        ("M5-K-CHANCE", "M5-C-DATA"),
        ("S5-K-LINE", "S5-C-CONCEPT"),
        ("S5-K-PENDULUM", "S5-C-INQUIRY"),
        ("S5-K-LAYER", "S5-C-THINK"),
        ("S5-K-HABIT", "S5-C-RESP"),
    ]:
        add_e(src, "develops", tgt)

    add_n(
        "X5-BODY",
        "cross_disciplinary_theme",
        "用小数记录并比较体质指标",
        source=sp(58, 60, "体质标准表使用小数") + "；" + mp(2, 20, "小数的意义与比大小"),
    )
    add_n(
        "X5-TIME",
        "cross_disciplinary_theme",
        "计时实验中的测量记录与比较",
        source=sp(50, 53, "记录30秒内摆动次数并比较") + "；" + mp(2, 20, "比大小"),
    )
    for theme, targets in {
        "X5-BODY": ["M5-K-DEC-PLACE", "M5-K-DEC-CMP", "S5-K-BMI"],
        "X5-TIME": ["S5-K-PENDULUM", "M5-K-DEC-CMP"],
    }.items():
        for target in targets:
            add_e(theme, "cross_links", target)

    add_e("M5-K-DEC-PLACE", "prerequisite_of", "M5-K-DEC-CMP")
    add_e("M5-K-DEC-PLACE", "prerequisite_of", "M5-K-DEC-ADD")
    add_e("M5-K-DEC-PLACE", "prerequisite_of", "M5-K-DEC-MUL")
    add_e("M5-K-AREA-FORM", "prerequisite_of", "M5-K-LEAF")
    add_e("M5-K-AREA-IRR", "applies_to", "M5-P-LEAF")
    add_e("S5-K-REFLECT", "prerequisite_of", "S5-K-SCOPE")
    add_e("S5-K-LINE", "prerequisite_of", "S5-K-BLOCK")

    meta = {
        "title": "五年级上册数学与科学知识图谱",
        "version": "1.0",
        "generated_date": "2026-09-23",
        "grade": "五年级",
        "semester": "上册",
        "subjects": ["数学", "科学"],
        "scope_note": "教材节点是五年级上册实际内容。课标节点是5—6年级第三学段要求。status=stage_later 的内容属于该学段，但本册没有系统学习，不能当成已经掌握。科学教材文本有识别错误，知识点依据目录、聚焦、研讨和能读出的结论，不把无意义英文当作原文。",
        "page_reference": "教材使用目录书内页。本份 Markdown 未核对 PDF 阅读器页码，因此不写 PDF 页。课标使用学段内容要求标题。",
        "source_files": [
            "五年级上数学.md",
            "五年级上册科学.md",
            "（5）义务教育数学课程标准日常修订版（2022年版2025年修订）.md",
            "（10）义务教育科学课程标准日常修订版（2022年版2025年修订）.md",
        ],
        "extraction_basis": [
            "北师大版数学五年级上册目录、课页与整理复习「我的收获」",
            "教科版科学五年级上册目录、聚焦与研讨",
            "数学课标第三学段（5～6年级）内容要求",
            "科学课标5～6年级光、地球内部与地表、健康生活相关内容要求",
        ],
        "limitations": [
            "数学课次只核对到单元书内页，课次页码用所在单元范围",
            "科学教材 OCR 不稳定，数字和标题以目录及能读通的聚焦、研讨为准",
            "光的折射写在教材里，5—6年级课标正文写的是反射改变方向，因此标为 extension",
            "摆的快慢在5—6年级课标中没有对应的计时条目，对齐状态不写成 direct",
        ],
    }
    return {
        "metadata": meta,
        "node_types": [
            "subject",
            "domain",
            "unit",
            "lesson",
            "knowledge",
            "method",
            "standard",
            "competency",
            "cross_disciplinary_theme",
        ],
        "relation_types": [
            "contains",
            "teaches",
            "uses_method",
            "aligns_to",
            "develops",
            "prerequisite_of",
            "applies_to",
            "cross_links",
        ],
        "nodes": nodes,
        "edges": edges,
    }


def reading_markdown(graph):
    units = [n for n in graph["nodes"] if n["type"] == "unit"]
    lines = [
        "# 五年级上册数学与科学知识图谱（阅读版）",
        "",
        "## 1. 来源与分析口径",
        "",
        "- 数学：北师大版《义务教育教科书 数学 五年级上册》。",
        "- 科学：教科版《义务教育教科书 科学 五年级上册》。",
        "- 课标：2022年版、2025年修订的数学、科学课程标准，只取5—6年级，不把整个学段写成本册已学。",
        "- 页码用教材目录的书内页。PDF 阅读器页码这次没有核对，所以不写。",
        "- 科学教材文本有识别错误，知识点来自目录、聚焦、研讨和能读通的结论。",
        "",
        "## 2. 节点和关系",
        "",
        "层级是学科、领域、单元、课次、知识点。方法、课标、核心素养和跨学科主题横向连接。",
        "`stage_later` 表示5—6年级要求里本册还没系统学的内容。",
        "",
        "## 3. 总览",
        "",
        "```mermaid",
        "flowchart LR",
        "  M[数学五年级上] --> MU1[小数的再认识]",
        "  M --> MU2[三角形]",
        "  M --> MU3[小数乘法]",
        "  M --> MU5[多边形面积]",
        "  M --> MU7[倍数与因数]",
        "  S[科学五年级上] --> SU1[光]",
        "  S --> SU2[地球表面的变化]",
        "  S --> SU3[计量时间]",
        "  S --> SU4[健康生活]",
        "```",
        "",
        "## 4. 单元",
        "",
        "| 单元 | 来源 |",
        "| --- | --- |",
    ]
    for unit in units:
        lines.append(f"| {unit['name']} | {unit.get('source','')} |")
    lines += [
        "",
        "## 5. 学习进阶",
        "",
        "- 小数的计数单位，先于小数比较、小数加减和小数乘法。",
        "- 多边形面积公式和估计不规则图形面积，用在「多少落叶能铺满」。",
        "- 光沿直线传播，先于影子；光的反射，先于制作潜望镜。",
        "- 和三年级上册的衔接只连真正接得上的内容：认识小数接到小数的再认识，小数比较接到比大小，小数点对齐接到小数加减，两位数乘法接到小数乘法。",
        "",
        "## 6. 跨学科",
        "",
        "- 健康生活里的体质标准用小数写出体重指数范围，对应数学的小数意义和比大小。",
        "- 摆的快慢实验要记录并比较一定时间内的摆动次数，对应数学里比较数量。",
        "- 光、地球表面变化和数学没有另建边。",
        "",
        "## 7. 本册未覆盖的5—6年级要求",
        "",
        "分数及其四则运算，比和比例，圆与圆周率，体积和常见立体图形，折线统计图、扇形统计图和百分数，岩石与矿物，雨雪雾的成因，地球自转公转和月相。这些都标成 `stage_later`。",
        "",
        "## 8. 限制",
        "",
        "- 数学课次页码用的是单元范围，不是每一课的起始页。",
        "- 光的折射是教材明确写出的，5—6年级课标对应条目写的是反射，所以标成超出本学段最低要求。",
        "- 摆的等时和计时工具在5—6年级课标里没有单独条目，不写成直接对应。",
        "",
    ]
    return "\n".join(lines)


def stamp_grade3(graph):
    for node in graph["nodes"]:
        node.setdefault("grade", "三年级")
        node.setdefault("semester", "上册")
    return graph


def merge(g3, g5):
    nodes = g3["nodes"] + g5["nodes"]
    edges = g3["edges"] + g5["edges"]
    bridges = [
        ("M-K-DECIMAL", "M5-K-DEC-PLACE"),
        ("M-K-DECCOMP", "M5-K-DEC-CMP"),
        ("M-K-ALIGN", "M5-K-DEC-ADD"),
        ("M-K-2D-MUL", "M5-K-DEC-MUL"),
    ]
    ids = {node["id"] for node in nodes}
    for src, tgt in bridges:
        if src not in ids or tgt not in ids:
            raise SystemExit(f"missing bridge endpoint {src} -> {tgt}")
        edges.append({"source": src, "relation": "prerequisite_of", "target": tgt})
    types = Counter(node["type"] for node in nodes)
    return {
        "metadata": {
            "title": "智启知识图谱",
            "version": "2.1",
            "generated_date": "2026-09-23",
            "grade": "三年级",
            "semester": "上册",
            "grades": ["三年级", "五年级"],
            "subjects": ["数学", "科学"],
            "scope_note": "本地页面把三年级上册和五年级上册画在同一张图里，按年级分区。查询仍按年级和册次分开，不传年级时默认三年级上册。stage_later 不能解释为本册已经完成。",
            "merged_from": [
                "三年级上册数学与科学知识图谱.json",
                "五年级上册数学与科学知识图谱.json",
            ],
            "page_reference": g3["metadata"].get("page_reference", ""),
            "source_files": g3["metadata"].get("source_files", []) + g5["metadata"].get("source_files", []),
        },
        "node_types": g5["node_types"],
        "relation_types": g5["relation_types"],
        "nodes": nodes,
        "edges": edges,
        "node_type_counts": dict(types),
    }


def update_index(g5):
    index = json.loads(INDEX_JSON.read_text(encoding="utf-8"))
    counts = Counter(node["type"] for node in g5["nodes"])
    entry = {
        "graph_id": "GRADE5-S1-MATH-SCI",
        "title": "五年级上册数学与科学知识图谱",
        "version": "1.0",
        "grade": "五年级",
        "grade_aliases": ["五年级", "小学五年级", "5年级"],
        "semester": "上册",
        "semester_aliases": ["上册", "上学期", "第一学期"],
        "subjects": ["数学", "科学"],
        "files": ["五年级上册数学与科学知识图谱.json"],
        "source_graph_file": "五年级上册数学与科学知识图谱.json",
        "node_count": len(g5["nodes"]),
        "edge_count": len(g5["edges"]),
        "node_types": dict(counts),
        "coverage_status": "partial",
        "scope_note": "五年级上册数学与科学。查询按年级分开。网站全部视角与三年级上册画在同一张图上。",
    }
    graphs = [g for g in index["graphs"] if g.get("graph_id") != entry["graph_id"]]
    graphs.append(entry)
    index["graphs"] = graphs
    index["generated_date"] = "2026-09-23"
    INDEX_JSON.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    g5 = build_graph()
    G5_JSON.write_text(json.dumps(g5, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    G5_READING.write_text(reading_markdown(g5), encoding="utf-8")
    machine = (
        "# 五年级上册数学与科学知识图谱（机器版）\n\n"
        "权威数据只有下面这一份 JSON。\n\n```json\n"
        + json.dumps(g5, ensure_ascii=False, indent=2)
        + "\n```\n"
    )
    G5_MACHINE.write_text(machine, encoding="utf-8")
    g3 = stamp_grade3(json.loads(G3_JSON.read_text(encoding="utf-8")))
    merged = merge(g3, g5)
    PUBLIC_JSON.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_index(g5)
    print(f"grade5 nodes {len(g5['nodes'])} edges {len(g5['edges'])}")
    print(f"merged nodes {len(merged['nodes'])} edges {len(merged['edges'])}")


if __name__ == "__main__":
    main()
