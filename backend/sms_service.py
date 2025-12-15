# -*- coding: utf-8 -*-
"""
阿里云短信验证码服务
使用云通信号码认证服务 (dypnsapi) 发送验证码
"""
import os
import random
import string
from alibabacloud_dypnsapi20170525.client import Client as Dypnsapi20170525Client
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_dypnsapi20170525 import models as dypnsapi_models
from alibabacloud_tea_util import models as util_models


def create_client() -> Dypnsapi20170525Client:
    """使用 AccessKey 初始化客户端"""
    config = open_api_models.Config(
        access_key_id=os.getenv("ALIYUN_ACCESS_KEY_ID"),
        access_key_secret=os.getenv("ALIYUN_ACCESS_KEY_SECRET")
    )
    config.endpoint = "dypnsapi.aliyuncs.com"
    return Dypnsapi20170525Client(config)


def generate_code(length: int = 6) -> str:
    """生成随机数字验证码"""
    return ''.join(random.choices(string.digits, k=length))


def send_verification_code(phone: str, code: str) -> dict:
    """
    发送短信验证码
    
    Args:
        phone: 手机号
        code: 验证码
        
    Returns:
        dict: 包含 success 和 message
    """
    try:
        client = create_client()
        
        # 从环境变量读取配置
        scheme_name = os.getenv("SMS_SCHEME_NAME", "AIGC OG")
        sign_name = os.getenv("SMS_SIGN_NAME", "速通互联验证码")
        template_code = os.getenv("SMS_TEMPLATE_CODE", "100001")
        
        request = dypnsapi_models.SendSmsVerifyCodeRequest(
            scheme_name=scheme_name,
            phone_number=phone,
            sign_name=sign_name,
            template_code=template_code,
            template_param=f'{{"code":"{code}","min":"5"}}'
        )
        
        response = client.send_sms_verify_code_with_options(
            request, 
            util_models.RuntimeOptions()
        )
        
        if response.body.code == "OK":
            return {"success": True, "message": "验证码已发送"}
        else:
            return {"success": False, "message": response.body.message or "发送失败"}
            
    except Exception as e:
        error_msg = str(e)
        print(f"SMS Error: {error_msg}")
        return {"success": False, "message": f"短信发送失败: {error_msg}"}
