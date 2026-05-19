"""Short Drama 智能体模块

Adapted from HKUDS/ViMax (MIT License).
对 ViMax/agents 的精简移植：
- screenwriter: idea/script -> 文本剧本（不返回多场景，单段连续剧本）
- character_extractor: 剧本 -> 角色列表
- portrait_generator: 角色 -> 单张正面立绘（砍掉 side/back）
- storyboard_artist: 剧本 -> 分镜列表 + first/last/motion 拆解
- reference_image_selector: 帧描述 + 候选参考图 -> 最终参考图集合 + 文本提示
"""
from .screenwriter import Screenwriter
from .character_extractor import CharacterExtractor
from .portrait_generator import PortraitGenerator
from .storyboard_artist import StoryboardArtist
from .reference_image_selector import ReferenceImageSelector

__all__ = [
    "Screenwriter",
    "CharacterExtractor",
    "PortraitGenerator",
    "StoryboardArtist",
    "ReferenceImageSelector",
]
